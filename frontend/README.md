# TaskOrbit Frontend

TaskOrbit is an enterprise task management workspace built with Angular 22, PrimeNG 22, PrimeFlex 4, PrimeIcons, and the PrimeUIX Aura theme.

## Development

```powershell
npm install
npm start
```

The development server is available at `http://localhost:4200`. Requests beginning with `/api` are proxied to `http://localhost:5000`.

```powershell
npm run build
npm test
```

## Architecture

- `core/`: application-wide authentication, guards, interceptors, API constants, models, and services.
- `shared/`: reusable components, pipes, directives, and typed utilities. Shared code must not depend on a single feature.
- `layouts/`: application shell and enterprise workspace layout.
- `features/`: route-focused, lazy-loaded business areas.
- `app.routes.ts`: route composition and route-level authorization.
- Standalone components, signals, reactive forms, and RxJS are the UI foundation.

## API reference

See [API_INTEGRATION.md](docs/API_INTEGRATION.md) for the implemented backend contract.

## PrimeUI / PrimeNG licensing

This project currently uses the PrimeNG community packages and the PrimeUIX Aura theme. The source code uses the package exactly as configured in `app.config.ts` and does not suppress, bypass, or mock license verification.

Before using any PrimeNG or PrimeUIX offering that requires a commercial license in production, obtain the official license and configure it using the vendor's current documentation. Keep license configuration outside source control when it contains credentials or secrets.
