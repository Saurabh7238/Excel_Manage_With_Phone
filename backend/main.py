import json
import os
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Form, Header, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from .excel_manager import ExcelManager
except ImportError:
    from excel_manager import ExcelManager


ROOT = Path(__file__).resolve().parent.parent
load_dotenv(Path(__file__).resolve().parent / ".env")
IS_VERCEL = os.getenv("VERCEL") == "1"
STORAGE_ROOT = Path("/tmp") if IS_VERCEL else ROOT
DEFAULT_CONFIG = STORAGE_ROOT / "config.json" if IS_VERCEL else ROOT / "backend" / "config.json"
manager = ExcelManager(
    Path(os.getenv("BUSINESS_FILE", str(STORAGE_ROOT / "Business.xlsx"))),
    Path(os.getenv("CONFIG_FILE", str(DEFAULT_CONFIG))),
)

app = FastAPI(title="Business Manager API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    password: str


class RowRequest(BaseModel):
    values: dict[str, Any]


class BulkRowsRequest(BaseModel):
    mode: Literal["append", "update"]
    rows: list[dict[str, Any]]
    indices: list[int] = Field(default_factory=list)


class CreateListRequest(BaseModel):
    name: str
    fields: list[dict[str, Any]] = Field(default_factory=list)


class FieldRequest(BaseModel):
    name: str
    type: str = "text"
    formula: str | None = None
    options: list[str] = Field(default_factory=list)
    target_sheet: str | None = None
    target_field: str | None = None


def require_auth(authorization: str | None = Header(default=None)) -> None:
    password = os.getenv("APP_PASSWORD", "change-me")
    if not authorization or authorization != f"Bearer {password}":
        raise HTTPException(status_code=401, detail="Sign in to continue")
    try:
        manager.refresh_from_storage()
    except Exception as error:
        raise HTTPException(status_code=503, detail="Workbook storage is temporarily unavailable") from error


api = APIRouter(prefix="/api", dependencies=[Depends(require_auth)])


@app.post("/api/login")
def login(request: LoginRequest):
    password = os.getenv("APP_PASSWORD", "change-me")
    if request.password != password:
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"token": password}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@api.get("/lists")
def get_lists():
    return manager.get_lists()


@api.get("/export")
def export_workbook():
    filename = quote(manager.workbook_path.name)
    return Response(
        content=manager.export_workbook(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@api.post("/google-sync")
def sync_google_sheets():
    credential_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "")
    if not credential_json or not spreadsheet_id:
        raise HTTPException(
            status_code=400,
            detail="Configure GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHEETS_SPREADSHEET_ID on the server",
        )
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        service_account = json.loads(credential_json)
        credentials = Credentials.from_service_account_info(
            service_account,
            scopes=["https://www.googleapis.com/auth/spreadsheets"],
        )
        service = build("sheets", "v4", credentials=credentials, cache_discovery=False)
        spreadsheet = service.spreadsheets()
        metadata = spreadsheet.get(spreadsheetId=spreadsheet_id).execute()
        existing_titles = {item["properties"]["title"] for item in metadata.get("sheets", [])}
        managed_titles = list(manager.config["sheets"])
        missing_titles = [title for title in managed_titles if title not in existing_titles]
        if missing_titles:
            spreadsheet.batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={"requests": [{"addSheet": {"properties": {"title": title}}} for title in missing_titles]},
            ).execute()

        for sheet_name in managed_titles:
            data = manager.get_data(sheet_name)
            headers = [field["name"] for field in data["fields"]]
            link_options = {
                field["name"]: {item["id"]: item["label"] for item in field.get("options", [])}
                for field in data["fields"]
                if field["type"] == "link"
            }
            values = [headers]
            for row in data["rows"]:
                values.append([
                    link_options.get(field["name"], {}).get(str(row.get(field["name"])), row.get(field["name"]))
                    for field in data["fields"]
                ])
            sheet_range = f"'{sheet_name.replace(chr(39), chr(39) * 2)}'!A:ZZ"
            spreadsheet.values().clear(
                spreadsheetId=spreadsheet_id,
                range=sheet_range,
                body={},
            ).execute()
            spreadsheet.values().update(
                spreadsheetId=spreadsheet_id,
                range=f"'{sheet_name.replace(chr(39), chr(39) * 2)}'!A1",
                valueInputOption="RAW",
                body={"values": values},
            ).execute()
        return {"status": "synced", "sheets": len(managed_titles), "url": f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Google Sheets sync failed: {error}") from error


@api.post("/upload")
async def upload_workbook(file: UploadFile = File(...), options: str = Form(default="{}")):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Upload an .xlsx Excel workbook")
    try:
        import_options = json.loads(options)
        if not isinstance(import_options, dict):
            raise ValueError("Import options must be an object")
        return manager.import_workbook(await file.read(), import_options)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail="Import options must be valid JSON") from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.post("/upload/preview")
async def preview_workbook(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Upload an .xlsx Excel workbook")
    try:
        return manager.preview_workbook(await file.read())
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.get("/{sheet_name}/data")
def get_data(sheet_name: str):
    try:
        return manager.get_data(sheet_name)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@api.post("/{sheet_name}/add-row")
def add_row(sheet_name: str, request: RowRequest):
    try:
        return {"row": manager.add_row(sheet_name, request.values)}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.post("/{sheet_name}/bulk-rows")
def bulk_rows(sheet_name: str, request: BulkRowsRequest):
    try:
        if request.mode == "append":
            rows = manager.bulk_add_rows(sheet_name, request.rows)
        else:
            rows = manager.bulk_update_rows(sheet_name, request.indices, request.rows)
        return {"count": len(rows), "rows": rows}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except IndexError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.post("/{sheet_name}/rows/{row_index}/preview")
def preview_row_update(sheet_name: str, row_index: int, request: RowRequest):
    try:
        return manager.preview_row_update(sheet_name, row_index, request.values)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (IndexError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.put("/{sheet_name}/rows/{row_index}")
def update_row(sheet_name: str, row_index: int, request: RowRequest):
    try:
        return manager.update_row(sheet_name, row_index, request.values)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (IndexError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.delete("/{sheet_name}/rows/{row_index}")
def delete_row(sheet_name: str, row_index: int):
    try:
        return manager.delete_row(sheet_name, row_index)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except IndexError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.post("/{sheet_name}/rows/{row_index}/restore")
def restore_row(sheet_name: str, row_index: int, request: RowRequest):
    try:
        return manager.restore_row(sheet_name, row_index, request.values)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.get("/{sheet_name}/rows/{record_id}/attachments")
def list_attachments(sheet_name: str, record_id: str):
    try:
        return manager.list_attachments(sheet_name, record_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@api.post("/{sheet_name}/rows/{record_id}/attachments")
async def add_attachment(sheet_name: str, record_id: str, file: UploadFile = File(...)):
    filename = Path(file.filename or "").name
    if not filename:
        raise HTTPException(status_code=400, detail="Choose a file to attach")
    content = await file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Attachments must be 10 MB or smaller")
    try:
        return manager.add_attachment(
            sheet_name,
            record_id,
            filename,
            file.content_type or "application/octet-stream",
            content,
        )
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@api.get("/{sheet_name}/rows/{record_id}/attachments/{attachment_id}")
def download_attachment(sheet_name: str, record_id: str, attachment_id: str):
    try:
        metadata, content = manager.read_attachment(sheet_name, record_id, attachment_id)
        filename = quote(metadata["name"])
        return Response(
            content=content,
            media_type=metadata["content_type"],
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
        )
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@api.delete("/{sheet_name}/rows/{record_id}/attachments/{attachment_id}")
def delete_attachment(sheet_name: str, record_id: str, attachment_id: str):
    try:
        manager.delete_attachment(sheet_name, record_id, attachment_id)
        return {"status": "deleted"}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@api.post("/{sheet_name}/add-field")
def add_field(sheet_name: str, request: FieldRequest):
    try:
        manager.add_field(sheet_name, request.model_dump(exclude_none=True))
        return manager.get_data(sheet_name)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.put("/{sheet_name}/fields/{field_name}")
def update_field(sheet_name: str, field_name: str, request: dict[str, Any]):
    try:
        manager.update_field(sheet_name, field_name, request)
        return manager.get_data(sheet_name)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.delete("/{sheet_name}/fields/{field_name}")
def delete_field(sheet_name: str, field_name: str):
    try:
        manager.delete_field(sheet_name, field_name)
        return manager.get_data(sheet_name)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.post("/{sheet_name}/create")
def create_list(sheet_name: str, request: CreateListRequest):
    try:
        manager.create_sheet(request.name, request.fields)
        return manager.get_data(request.name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@api.put("/{sheet_name}/styles")
def save_styles(sheet_name: str, styles: dict[str, Any]):
    try:
        manager.save_styles(sheet_name, styles)
        return {"status": "saved"}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


app.include_router(api)