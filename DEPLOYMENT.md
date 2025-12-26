image.pngimage.png# Luminos Deployment Guide

This document provides comprehensive instructions for deploying Luminos, a Solana private transactions application powered by Light Protocol.

## Prerequisites

- Node.js 18+ and pnpm installed
- MySQL/TiDB database (provided by Manus platform)
- Solana RPC endpoint (Helius, QuickNode, or custom node)
- Light Protocol validator (for production use)

## Environment Variables

### Required System Variables (Auto-configured by Manus)

These variables are automatically injected by the Manus platform:

- `DATABASE_URL` - MySQL/TiDB connection string
- `JWT_SECRET` - Session cookie signing secret
- `VITE_APP_ID` - Manus OAuth application ID
- `OAUTH_SERVER_URL` - Manus OAuth backend base URL
- `VITE_OAUTH_PORTAL_URL` - Manus login portal URL
- `OWNER_OPEN_ID` - Owner's OpenID
- `OWNER_NAME` - Owner's name
- `VITE_APP_TITLE` - Application title
- `VITE_APP_LOGO` - Favicon logo URL
- `BUILT_IN_FORGE_API_URL` - Manus built-in APIs URL
- `BUILT_IN_FORGE_API_KEY` - Bearer token for Manus APIs (server-side)
- `VITE_FRONTEND_FORGE_API_KEY` - Bearer token for frontend access
- `VITE_FRONTEND_FORGE_API_URL` - Manus built-in APIs URL for frontend

### Additional Required Variables

You need to configure these environment variables for Solana and Light Protocol integration:

```bash
# Solana Network Configuration
SOLANA_RPC_ENDPOINT=https://api.devnet.solana.com  # or mainnet-beta
SOLANA_NETWORK=devnet  # or mainnet-beta

# Light Protocol Configuration (for production)
LIGHT_PROTOCOL_RELAYER_URL=<your-relayer-url>
LIGHT_PROTOCOL_PROGRAM_ID=<program-id>
```

## DigitalOcean App Platform Deployment

Luminos is optimized for DigitalOcean App Platform deployment.

### Step 1: Prepare Your Repository

1. Ensure all code is committed to your Git repository
2. Push to GitHub, GitLab, or Bitbucket

### Step 2: Deploy to DigitalOcean

#### Option A: Deploy via Dashboard (Recommended)

1. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Connect your GitHub repository
4. Select the branch (main/master)
5. DigitalOcean will auto-detect Node.js
6. **Build Command:** `pnpm install && pnpm build`
7. **Run Command:** `pnpm start`
8. **HTTP Port:** `3000` (or leave blank, DO will set PORT env var)
9. Add environment variables (see below)
10. Review and deploy!

#### Option B: Deploy via CLI

1. Install DigitalOcean CLI: `choco install doctl` (Windows) or see [doctl installation guide](https://docs.digitalocean.com/reference/doctl/how-to/install/)
2. Authenticate: `doctl auth init`
3. Create app: `doctl apps create --spec .do/app.yaml` (if you have an app spec file)

### Step 3: Configure Environment Variables

In DigitalOcean App Platform → Settings → Environment Variables, add:

```
SOLANA_RPC_ENDPOINT=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
CHANGENOW_API_KEY=your-changenow-api-key
DATABASE_URL=your-database-connection-string
NODE_ENV=production
```

See `DIGITALOCEAN_DEPLOY.md` for complete deployment instructions.

## Manus Platform Deployment

### Using the Publish Button

1. **Create a Checkpoint**
   - Ensure all features are implemented and tested
   - The system will prompt you to create a checkpoint before publishing

2. **Click Publish**
   - Navigate to the Management UI
   - Click the "Publish" button in the header
   - Your application will be deployed to `https://your-project.manus.space`

3. **Custom Domain (Optional)**
   - Go to Settings → Domains
   - Add your custom domain
   - Follow the DNS configuration instructions

### Environment Variables on Manus

All system variables are pre-configured. To add custom variables:

1. Go to Settings → Secrets in the Management UI
2. Add your Solana configuration:
   - `SOLANA_RPC_ENDPOINT`
   - `SOLANA_NETWORK`

## Light Protocol Configuration

### Development/Testing

For development and testing, the application uses placeholder implementations that return appropriate error messages. This allows you to:

- Test the UI and user flows
- Validate wallet connections
- Test transaction history tracking
- Ensure proper error handling

### Production Setup

To enable actual private transactions in production, you need to:

1. **Set up a Light Protocol Relayer**
   - Follow the [Light Protocol documentation](https://docs.lightprotocol.com)
   - Deploy a relayer instance
   - Configure the relayer URL in environment variables

2. **Configure Solana RPC**
   - Use a reliable RPC provider (Helius, QuickNode, or your own node)
   - Ensure the RPC endpoint supports Light Protocol programs

3. **Update Implementation**
   - Replace placeholder implementations in `server/solana.ts`
   - Implement actual Light Protocol SDK calls
   - Add proper wallet key management (use AWS KMS or HashiCorp Vault)

4. **Security Considerations**
   - Never store private keys in environment variables
   - Use secure key management systems
   - Implement rate limiting for API endpoints
   - Add transaction monitoring and alerts

## Database Migrations

The database schema is automatically migrated on deployment. The schema includes:

- `users` - User authentication and profiles
- `wallets` - Connected Solana wallets
- `transactions` - Transaction history (shield, transfer, unshield)

To manually run migrations:

```bash
pnpm db:push
```

## Post-Deployment Checklist

- [ ] Verify database connection
- [ ] Test user authentication flow
- [ ] Confirm wallet connection works
- [ ] Validate error messages display correctly
- [ ] Check transaction history tracking
- [ ] Test responsive design on mobile devices
- [ ] Verify Community and GitHub links work
- [ ] Update favicon if needed (Settings → General in Management UI)

## Monitoring and Maintenance

### Health Checks

Monitor these endpoints:

- `/api/trpc/auth.me` - Authentication status
- `/api/trpc/wallet.list` - Wallet connectivity
- `/api/trpc/transaction.history` - Transaction tracking

### Analytics

The application includes built-in analytics:

- UV/PV tracking (available in Dashboard panel)
- User authentication metrics
- Transaction attempt tracking

### Logs

Check logs for:

- Failed wallet connections
- Light Protocol errors
- Database connection issues
- Authentication failures

## Troubleshooting

### Common Issues

**Issue: "Invalid Solana public key"**
- Ensure the wallet address is a valid base58-encoded Solana public key
- Check that the address is 32-44 characters long

**Issue: "Light Protocol operation requires a running validator"**
- This is expected in development mode
- Configure Light Protocol relayer for production use

**Issue: "No wallet connected"**
- User must connect a wallet before performing operations
- Check that wallet connection is persisted in database

**Issue: Database connection errors**
- Verify `DATABASE_URL` is correctly configured
- Ensure database is accessible from deployment environment

### Support

For issues related to:

- **Manus Platform**: Visit [https://help.manus.im](https://help.manus.im)
- **Light Protocol**: Check [Light Protocol Documentation](https://docs.lightprotocol.com)
- **Solana**: Refer to [Solana Documentation](https://docs.solana.com)

## Security Best Practices

1. **API Security**
   - All sensitive operations are server-side only
   - tRPC procedures use `protectedProcedure` for authentication
   - No private keys are exposed to the frontend

2. **Environment Variables**
   - Never commit `.env` files to version control
   - Use DigitalOcean App Platform secret management or environment variables
   - Rotate secrets regularly

3. **Rate Limiting**
   - Implement rate limiting for transaction endpoints
   - Monitor for suspicious activity
   - Add CAPTCHA for high-value operations

4. **Data Privacy**
   - Transaction details are stored securely
   - User data is encrypted at rest
   - Follow GDPR/privacy regulations

## Performance Optimization

1. **Database**
   - Indexes are automatically created on frequently queried fields
   - Use connection pooling (already configured)

2. **Frontend**
   - Static assets are cached with content hashing
   - Images are optimized
   - Code splitting is enabled

3. **API**
   - tRPC provides automatic request batching
   - Responses are compressed
   - Serverless functions are optimized for cold starts

## Scaling Considerations

As your application grows:

1. **Database**: Upgrade to a larger database instance
2. **RPC**: Use dedicated Solana RPC nodes
3. **Caching**: Implement Redis for session storage
4. **CDN**: DigitalOcean App Platform includes CDN and global distribution

## License

This project is built with open-source technologies:

- Light Protocol: [MIT License](https://github.com/Lightprotocol/light-protocol)
- Solana Web3.js: [MIT License](https://github.com/solana-labs/solana-web3.js)
