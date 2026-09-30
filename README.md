# Ledgerly Business Manager

A mobile-first business tracker with a React + Tailwind interface and a FastAPI backend. Records are stored in `Business.xlsx` with hidden stable IDs; schemas, link definitions, styles, and attachment metadata are stored in `backend/config.json`.

## Features

- Dashboard cards with record counts and numeric totals for Attendance, Payment Record, Company Details, and Follow Up.
- Mobile-friendly record cards with search, sorting on any field, filtering on any field, and list summaries.
- Dynamic add-record forms, including dropdowns, dates, numbers, and read-only formula fields.
- Create lists and add, rename, or delete fields from Manage fields.
- Preview an `.xlsx` workbook before importing it; each worksheet becomes a manageable list with its headers and rows imported.
- Edit existing records and preview proposed values, including recalculated formula fields, before saving.
- Delete records with a one-step undo action, and download the current workbook.
- Select worksheets and rename columns in the import preview before confirming an upload.
- Paste tab-separated data from Excel, preview it, then append rows or update selected records in one batch.
- Attach files to records and link records across lists using stable record IDs.
- Preview attached images and PDFs without downloading them.
- Scan an image from a phone camera to extract labeled values into a new or existing record form.
- Generate a PDF payment receipt and choose dashboard widgets to display.
- Sync managed worksheets one-way to a configured Google spreadsheet.
- Per-column bold, italic, underline, font size, text color, background color, and border styling, applied to the workbook with `openpyxl`.
- Formula fields support arithmetic, `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, and `IF`. Use square brackets for field names containing spaces, for example `[Unit Price] * Quantity`.
- Password-based API access.

## Run locally

Requirements: Python 3.10+ and Node.js 18+.

1. From the repository root, create `backend/.env` from `backend/.env.example` and set `APP_PASSWORD`.
2. Install and start the API:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn backend.main:app --reload
   ```

   The first start creates `Business.xlsx` with the four default sheets and creates `backend/config.json`.
3. In another terminal, start the frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

4. Open the Vite URL (normally `http://localhost:5173`) and sign in with `APP_PASSWORD`.

The API listens on `http://localhost:8000`; interactive API documentation is at `/docs`. Set `VITE_API_URL` in `frontend/.env` to change the API URL. Workbook and config locations can be changed with `BUSINESS_FILE` and `CONFIG_FILE` in `backend/.env`.

## Vercel deployment

The included `vercel.json` builds the FastAPI function and static frontend, routing `/api/*` to the backend. Set `APP_PASSWORD` in the Vercel project environment variables. The frontend uses same-origin `/api` requests in production.

Vercel's `/tmp` storage is temporary and instance-local. To persist the workbook and schema between deployments and function instances, configure an S3-compatible bucket in the Vercel project environment:

- `S3_BUCKET`: bucket name (required to enable object storage)
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: credentials with read/write access to the bucket
- `S3_REGION`: bucket region, such as `us-east-1`
- `S3_ENDPOINT_URL`: optional endpoint for compatible providers such as Cloudflare R2
- `S3_WORKBOOK_KEY` and `S3_CONFIG_KEY`: optional object keys; defaults are `business-manager/Business.xlsx` and `business-manager/config.json`
- `S3_ATTACHMENTS_PREFIX`: optional object prefix; defaults to `business-manager/attachments`

For Cloudflare R2, set `S3_ENDPOINT_URL` to the account's R2 endpoint, `S3_REGION` to `auto`, and use an R2 API token as the access key and secret. When `S3_BUCKET` is unset, the app continues to use local files; on Vercel those files are ephemeral. Bucket credentials must remain server-side and should never be prefixed with `VITE_`.

To enable Google Sheets sync, enable the Google Sheets API in a Google Cloud project, create a service account, and share the destination spreadsheet with that service account's email as an editor. Set `GOOGLE_SERVICE_ACCOUNT_JSON` to the service-account JSON and `GOOGLE_SHEETS_SPREADSHEET_ID` to the destination spreadsheet ID in the server environment. These values are only read by the backend and must not be exposed through `VITE_` variables. Sync is one-way from this app to Sheets and replaces cell values in tabs matching the managed worksheet names.

Record attachments are limited to 10 MB each. They use the local `attachments/` folder during development and the S3-compatible bucket in deployed environments when `S3_BUCKET` is configured. Link fields save the target record's stable ID in the workbook and resolve its display label from the target list.

## API

All routes except `/api/login` and `/api/health` require `Authorization: Bearer <APP_PASSWORD>`.

- `GET /api/lists`
- `GET /api/export` downloads the current workbook.
- `POST /api/google-sync` synchronizes managed lists to the configured Google spreadsheet.
- `POST /api/upload/preview` with an `.xlsx` multipart file; previews worksheet names, fields, and sample rows without changing stored data.
- `POST /api/upload` with an `.xlsx` multipart file and optional `options` JSON form field (`sheets` and per-sheet `mapping`); replaces the managed workbook with the selected and mapped worksheets.
- `POST /api/{sheet_name}/rows/{row_index}/preview` with `{ "values": { ... } }`
- `PUT /api/{sheet_name}/rows/{row_index}` with `{ "values": { ... } }`
- `POST /api/{sheet_name}/bulk-rows` with `{ "mode": "append", "rows": [...] }` or `{ "mode": "update", "indices": [...], "rows": [...] }`
- `DELETE /api/{sheet_name}/rows/{row_index}` returns the deleted row for undo.
- `POST /api/{sheet_name}/rows/{row_index}/restore` with `{ "values": { ... } }`
- `GET|POST /api/{sheet_name}/rows/{record_id}/attachments`
- `GET|DELETE /api/{sheet_name}/rows/{record_id}/attachments/{attachment_id}`
- Add link fields from Manage fields by choosing a target worksheet and display column; record forms store stable target IDs.
- `GET /api/{sheet_name}/data`
- `POST /api/{sheet_name}/add-row` with `{ "values": { ... } }`
- `POST /api/{sheet_name}/add-field`
- `PUT|DELETE /api/{sheet_name}/fields/{field_name}`
- `POST /api/{sheet_name}/create` with `{ "name": "...", "fields": [...] }`
- `PUT /api/{sheet_name}/styles`