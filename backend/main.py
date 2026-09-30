import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException
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


class CreateListRequest(BaseModel):
    name: str
    fields: list[dict[str, Any]] = Field(default_factory=list)


class FieldRequest(BaseModel):
    name: str
    type: str = "text"
    formula: str | None = None
    options: list[str] = Field(default_factory=list)


def require_auth(authorization: str | None = Header(default=None)) -> None:
    password = os.getenv("APP_PASSWORD", "change-me")
    if not authorization or authorization != f"Bearer {password}":
        raise HTTPException(status_code=401, detail="Sign in to continue")


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