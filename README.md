# Ledgerly Business Manager

A mobile-first business tracker with a React + Tailwind interface and a FastAPI backend. Records are stored in `Business.xlsx`; list schemas and column formatting are stored in `backend/config.json`.

## Features

- Dashboard cards with record counts and numeric totals for Attendance, Payment Record, Company Details, and Follow Up.
- Mobile-friendly record cards with search, status filtering, and list summaries.
- Dynamic add-record forms, including dropdowns, dates, numbers, and read-only formula fields.
- Create lists and add, rename, or delete fields from Manage fields.
- Upload an `.xlsx` workbook from the dashboard; each worksheet becomes a manageable list with its headers and rows imported.
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

Vercel's `/tmp` storage is temporary and instance-local. The workbook and config are placed there so the function can start, but Excel changes may disappear after a cold start and are not shared reliably between function instances. Use persistent shared storage for production records, or run the app on a persistent server when `Business.xlsx` must remain the database.

## API

All routes except `/api/login` and `/api/health` require `Authorization: Bearer <APP_PASSWORD>`.

- `GET /api/lists`
- `POST /api/upload` with an `.xlsx` multipart file; replaces the managed workbook with the uploaded worksheets.
- `GET /api/{sheet_name}/data`
- `POST /api/{sheet_name}/add-row` with `{ "values": { ... } }`
- `POST /api/{sheet_name}/add-field`
- `PUT|DELETE /api/{sheet_name}/fields/{field_name}`
- `POST /api/{sheet_name}/create` with `{ "name": "...", "fields": [...] }`
- `PUT /api/{sheet_name}/styles`