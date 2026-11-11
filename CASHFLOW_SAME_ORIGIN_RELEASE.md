# Cashflow same-origin routing

The dashboard is a static first-party asset under /cashflow-intelligence/.
The Cloudflare Pages Function under /cashflow-intelligence/api/cashflow/* uses the CASHFLOW_BACKEND Service Binding to the existing tet-dinh-mui-cashflow Worker.
The private dashboard Access Key remains in the Worker, never copied to the browser bundle or Editor Secrets.
Both production and preview Pages deployment configurations require binding CASHFLOW_BACKEND -> tet-dinh-mui-cashflow (production environment).
No GitHub operations. Preserve existing Editor routes and shortcuts.
