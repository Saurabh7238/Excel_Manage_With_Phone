import json
from copy import deepcopy
from datetime import date, datetime
from pathlib import Path
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Border, Font, PatternFill, Side

from .formula_engine import FormulaError, calculate_formula


DEFAULT_SHEETS = {
    "Attendance": [
        {"name": "Name", "type": "text"},
        {"name": "Date", "type": "date"},
        {"name": "Status", "type": "dropdown", "options": ["Present", "Absent", "Leave"]},
        {"name": "Notes", "type": "text"},
    ],
    "Payment Record": [
        {"name": "Customer", "type": "text"},
        {"name": "Date", "type": "date"},
        {"name": "Bill", "type": "number"},
        {"name": "Paid", "type": "number"},
        {"name": "Balance", "type": "formula", "formula": "Bill - Paid"},
    ],
    "Company Details": [
        {"name": "Company", "type": "text"},
        {"name": "Contact", "type": "text"},
        {"name": "Phone", "type": "text"},
        {"name": "Email", "type": "text"},
    ],
    "Follow Up": [
        {"name": "Customer", "type": "text"},
        {"name": "Due Date", "type": "date"},
        {"name": "Status", "type": "dropdown", "options": ["Pending", "Done", "Reschedule"]},
        {"name": "Notes", "type": "text"},
    ],
}


class ExcelManager:
    def __init__(self, workbook_path: Path, config_path: Path):
        self.workbook_path = workbook_path
        self.config_path = config_path
        self.workbook_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config = self._load_config()
        if not self.workbook_path.exists():
            workbook = Workbook()
            workbook.remove(workbook.active)
            for name, fields in DEFAULT_SHEETS.items():
                workbook.create_sheet(name).append([field["name"] for field in fields])
                self.config["sheets"][name] = deepcopy(fields)
            workbook.save(self.workbook_path)
            self._save_config()
        self._sync_config_with_workbook()

    def _load_config(self) -> dict[str, Any]:
        if self.config_path.exists():
            try:
                config = json.loads(self.config_path.read_text(encoding="utf-8"))
                if isinstance(config.get("sheets"), dict):
                    return config
            except (json.JSONDecodeError, OSError):
                pass
        return {"sheets": {}, "styles": {}}

    def _save_config(self) -> None:
        self.config_path.write_text(json.dumps(self.config, indent=2), encoding="utf-8")

    def _load_workbook(self):
        return load_workbook(self.workbook_path)

    def _sync_config_with_workbook(self) -> None:
        workbook = self._load_workbook()
        changed = False
        for sheet in workbook.worksheets:
            fields = self.config["sheets"].get(sheet.title)
            names = [cell.value for cell in sheet[1] if cell.value is not None]
            if not fields:
                fields = [{"name": str(name), "type": "text"} for name in names]
                self.config["sheets"][sheet.title] = fields
                changed = True
            elif [field["name"] for field in fields] != names:
                sheet.delete_rows(1, 1)
                sheet.insert_rows(1)
                for index, field in enumerate(fields, start=1):
                    sheet.cell(1, index, field["name"])
                changed = True
        workbook.save(self.workbook_path)
        if changed or not self.config_path.exists():
            self._save_config()

    def _fields(self, sheet_name: str) -> list[dict[str, Any]]:
        if sheet_name not in self.config["sheets"]:
            raise KeyError(f"Unknown list: {sheet_name}")
        return self.config["sheets"][sheet_name]

    def _read_rows(self, sheet_name: str) -> list[dict[str, Any]]:
        workbook = self._load_workbook()
        sheet = workbook[sheet_name]
        names = [field["name"] for field in self._fields(sheet_name)]
        rows = []
        for values in sheet.iter_rows(min_row=2, values_only=True):
            if not any(value is not None for value in values):
                continue
            record = {}
            for index, name in enumerate(names):
                value = values[index] if index < len(values) else None
                if isinstance(value, (datetime, date)):
                    value = value.isoformat()[:10]
                record[name] = value
            rows.append(record)
        return rows

    @staticmethod
    def _summary(rows: list[dict[str, Any]], fields: list[dict[str, Any]]) -> dict[str, Any]:
        sums = {}
        for field in fields:
            if field["type"] == "number":
                values = [row.get(field["name"]) for row in rows]
                sums[field["name"]] = sum(value for value in values if isinstance(value, (int, float)))
        return {"count": len(rows), "sums": sums}

    def get_lists(self) -> list[dict[str, Any]]:
        result = []
        for name, fields in self.config["sheets"].items():
            rows = self._read_rows(name)
            result.append({"name": name, "fields": fields, **self._summary(rows, fields)})
        return result

    def get_data(self, sheet_name: str) -> dict[str, Any]:
        fields = self._fields(sheet_name)
        rows = self._read_rows(sheet_name)
        return {"name": sheet_name, "fields": fields, "rows": rows, **self._summary(rows, fields)}

    def _save_rows(self, sheet_name: str, rows: list[dict[str, Any]]) -> None:
        fields = self._fields(sheet_name)
        workbook = self._load_workbook()
        sheet = workbook[sheet_name]
        for index in range(1, sheet.max_column + 1):
            sheet.cell(1, index).value = None
        for index, field in enumerate(fields, start=1):
            sheet.cell(1, index, field["name"])
        if sheet.max_row > 1:
            sheet.delete_rows(2, sheet.max_row - 1)
        for row in rows:
            sheet.append([row.get(field["name"]) for field in fields])
        self._apply_styles(workbook, sheet_name)
        workbook.save(self.workbook_path)

    def _calculate_formulas(self, sheet_name: str, rows: list[dict[str, Any]]) -> None:
        fields = self._fields(sheet_name)
        field_names = [field["name"] for field in fields]
        for field in fields:
            if field["type"] != "formula":
                continue
            for row in rows:
                try:
                    row[field["name"]] = calculate_formula(field.get("formula", ""), row, rows, field_names)
                except FormulaError as error:
                    raise ValueError(f"Formula for {field['name']}: {error}") from error

    def add_row(self, sheet_name: str, values: dict[str, Any]) -> dict[str, Any]:
        fields = self._fields(sheet_name)
        row = {}
        for field in fields:
            name = field["name"]
            if field["type"] == "formula":
                continue
            value = values.get(name)
            if field["type"] == "number" and value not in (None, ""):
                try:
                    value = float(value)
                except (TypeError, ValueError) as error:
                    raise ValueError(f"{name} must be a number") from error
            row[name] = value if value != "" else None
        rows = self._read_rows(sheet_name)
        rows.append(row)
        self._calculate_formulas(sheet_name, rows)
        self._save_rows(sheet_name, rows)
        return rows[-1]

    def create_sheet(self, name: str, fields: list[dict[str, Any]] | None = None) -> None:
        self._validate_sheet_name(name)
        if name in self.config["sheets"]:
            raise ValueError("A list with this name already exists")
        normalized = self._normalize_fields(fields or [{"name": "Name", "type": "text"}])
        workbook = self._load_workbook()
        sheet = workbook.create_sheet(name)
        sheet.append([field["name"] for field in normalized])
        self.config["sheets"][name] = normalized
        self.config["styles"][name] = {}
        self._apply_styles(workbook, name)
        workbook.save(self.workbook_path)
        self._save_config()

    def add_field(self, sheet_name: str, field: dict[str, Any]) -> None:
        fields = self._fields(sheet_name)
        normalized = self._normalize_fields([field])[0]
        if any(item["name"].casefold() == normalized["name"].casefold() for item in fields):
            raise ValueError("A field with this name already exists")
        fields.append(normalized)
        workbook = self._load_workbook()
        workbook[sheet_name].cell(1, len(fields), normalized["name"])
        rows = self._read_rows(sheet_name)
        for row in rows:
            row[normalized["name"]] = None
        self._calculate_formulas(sheet_name, rows)
        self._save_rows(sheet_name, rows)
        self._save_config()

    def update_field(self, sheet_name: str, field_name: str, changes: dict[str, Any]) -> None:
        fields = self._fields(sheet_name)
        field = next((item for item in fields if item["name"] == field_name), None)
        if field is None:
            raise KeyError(f"Unknown field: {field_name}")
        new_name = changes.get("name", field_name).strip()
        if not new_name:
            raise ValueError("Field name cannot be empty")
        if new_name != field_name and any(item["name"].casefold() == new_name.casefold() for item in fields):
            raise ValueError("A field with this name already exists")
        rows = self._read_rows(sheet_name)
        if new_name != field_name:
            for row in rows:
                row[new_name] = row.pop(field_name, None)
            style = self.config.get("styles", {}).get(sheet_name, {})
            if field_name in style:
                style[new_name] = style.pop(field_name)
            field["name"] = new_name
        if "type" in changes:
            field["type"] = changes["type"]
        if "formula" in changes:
            field["formula"] = changes["formula"]
        if "options" in changes:
            field["options"] = changes["options"]
        self._calculate_formulas(sheet_name, rows)
        self._save_rows(sheet_name, rows)
        self._save_config()

    def delete_field(self, sheet_name: str, field_name: str) -> None:
        fields = self._fields(sheet_name)
        if not any(item["name"] == field_name for item in fields):
            raise KeyError(f"Unknown field: {field_name}")
        if len(fields) == 1:
            raise ValueError("A list must have at least one field")
        rows = self._read_rows(sheet_name)
        fields[:] = [item for item in fields if item["name"] != field_name]
        self.config.get("styles", {}).get(sheet_name, {}).pop(field_name, None)
        for row in rows:
            row.pop(field_name, None)
        self._save_rows(sheet_name, rows)
        self._save_config()

    def save_styles(self, sheet_name: str, styles: dict[str, Any]) -> None:
        names = {field["name"] for field in self._fields(sheet_name)}
        if any(name not in names for name in styles):
            raise ValueError("Styles can only be applied to existing fields")
        saved_styles = self.config.setdefault("styles", {}).setdefault(sheet_name, {})
        for field_name, style in styles.items():
            saved_styles[field_name] = {**saved_styles.get(field_name, {}), **style}
        workbook = self._load_workbook()
        self._apply_styles(workbook, sheet_name)
        workbook.save(self.workbook_path)
        self._save_config()

    def _apply_styles(self, workbook, sheet_name: str) -> None:
        sheet = workbook[sheet_name]
        styles = self.config.get("styles", {}).get(sheet_name, {})
        for index, field in enumerate(self._fields(sheet_name), start=1):
            style = styles.get(field["name"], {})
            color = str(style.get("color", "#17211c")).lstrip("#")
            background = str(style.get("background", "#ffffff")).lstrip("#")
            border_enabled = style.get("border", False)
            border = Border(
                left=Side(style="thin", color="D9E3DD"),
                right=Side(style="thin", color="D9E3DD"),
                top=Side(style="thin", color="D9E3DD"),
                bottom=Side(style="thin", color="D9E3DD"),
            ) if border_enabled else Border()
            for row_index in range(1, sheet.max_row + 1):
                cell = sheet.cell(row_index, index)
                cell.font = Font(
                    name=cell.font.name or "Aptos",
                    size=style.get("fontSize", 11),
                    bold=style.get("bold", False),
                    italic=style.get("italic", False),
                    underline="single" if style.get("underline", False) else None,
                    color=color,
                )
                cell.fill = PatternFill(fill_type="solid", fgColor=background)
                cell.border = border

    @staticmethod
    def _normalize_fields(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
        allowed_types = {"text", "number", "date", "dropdown", "formula"}
        normalized = []
        seen = set()
        for field in fields:
            name = str(field.get("name", "")).strip()
            field_type = field.get("type", "text")
            if not name:
                raise ValueError("Field name cannot be empty")
            if name.casefold() in seen:
                raise ValueError("Field names must be unique")
            if field_type not in allowed_types:
                raise ValueError("Unsupported field type")
            item = {"name": name, "type": field_type}
            if field_type == "formula":
                formula = str(field.get("formula", "")).strip()
                if not formula:
                    raise ValueError("Formula fields need an expression")
                item["formula"] = formula
            if field_type == "dropdown":
                item["options"] = [str(option) for option in field.get("options", []) if str(option).strip()]
            normalized.append(item)
            seen.add(name.casefold())
        if not normalized:
            raise ValueError("A list must have at least one field")
        return normalized

    @staticmethod
    def _validate_sheet_name(name: str) -> None:
        if not name.strip() or len(name) > 31 or any(char in name for char in "[]:*?/\\"):
            raise ValueError("List name must be 1-31 characters and cannot contain []:*?/\\")