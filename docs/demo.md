[← README](../README.md)

# Try the demo

From this gem's directory:

```sh
bundle install
bin/demo
```

Open **http://127.0.0.1:4100**. Set `PORT=4200` to use another port.

Explore the demo pages, Ruby commands, and automatically discovered page controls. Try:

| Say or type | Demonstrates |
| --- | --- |
| `open users` | Turbo navigation |
| `give user 42 100 tokens` | Persist a token grant and update the balance in the UI |
| `change my plan to premium` | Update the demo account plan shown in the sidebar and Your plan card |
| `change my plan` | Choose Free, Premium, or Premium Plus in a follow-up |
| `show announcement` | A string follow-up |
| `set discount` | Decimal validation |
| `change notifications` | A boolean follow-up |
| `click the Try voice_control button` | Discover and click the button on Overview to open a demo modal |
| `fill workspace name` | Fill a field on Settings after a follow-up |
| `fill token balance with 500` | Fill the numeric field on a user edit page; then `click Save user` to persist it |
| `click Save settings` | Save the Settings form to SQLite |
| `summarize workspace` | Settings-only Ruby command; shows workspace details and a completion notice without reloading |

The dummy app automatically uses **Jev** when `JEV_API_KEY` or `TYPESAFE_API_KEY` is set in the server environment (`JEV_API_KEY` takes precedence). Start it with your key:

```sh
JEV_API_KEY=your-key bin/demo
```

The page shows **Jev interpreter** in this mode. Try free-form commands such as “take me to the report page.” The key stays on the server; interpretation sends your command and page context to Jev. Restart the demo after changing the key.

Without a key, the demo uses a **local, deterministic interpreter** that understands the listed phrases and aliases. Automated tests always boot in local mode and stub Jev requests. The dummy app runs as a fictional administrator and is intended for localhost only. Users support create, view, edit, and delete. Settings, account plans, and token grants persist in `test/dummy/storage/development.sqlite3`, including after a restart. `bin/demo` prepares the SQLite database and seeds 24 example users on first launch. Tests use a separate database with transactional fixtures. Active Record and SQLite are demo/development dependencies only; the gem itself still requires no database or migrations.
