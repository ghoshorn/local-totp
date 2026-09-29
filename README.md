# Local TOTP

A private, static, browser-only TOTP generator. It uses [OTPAuth](https://github.com/hectorm/otpauth) to calculate standard six-digit, SHA-1, 30-second codes.

Secrets are held only in browser memory. The site has no API, database, analytics, local storage, or server-side secret handling.

## Development

Node 22 or later is required. If you use `nvm`:

```sh
nvm use
yarn
yarn dev
```

Validate a production build with:

```sh
yarn test
yarn build
```

## Cloudflare Pages deployment

1. Push this directory as its own GitHub repository.
2. In the Cloudflare dashboard, create a **Pages** project and connect that repository.
3. Configure the build:
   - **Production branch:** `main`
   - **Build command:** `yarn build`
   - **Build output directory:** `dist`
   - **Node.js version:** `22`
4. Deploy. Each push to `main` creates a production deployment; pull requests receive preview deployments.

The [`public/_headers`](public/_headers) file is copied to `dist/_headers` by Vite and configures the security headers supported by Cloudflare Pages.

## License

This project depends on [OTPAuth](https://github.com/hectorm/otpauth), which is licensed under the MIT License.
