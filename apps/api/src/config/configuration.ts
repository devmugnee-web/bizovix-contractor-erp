export interface AppConfig {
  appName: string;
  appEnv: string;
  port: number;
  databaseUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  vendorAdminJwt: {
    secret: string;
    expiresIn: string;
  };
}

export default (): { app: AppConfig } => ({
  app: {
    appName: process.env.APP_NAME ?? "Bizovix Contractor ERP",
    appEnv: process.env.APP_ENV ?? "development",
    port: Number(process.env.APP_PORT ?? 4000),
    databaseUrl: process.env.DATABASE_URL ?? "",
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? "",
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? "",
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
    },
    vendorAdminJwt: {
      secret: process.env.VENDOR_ADMIN_JWT_SECRET ?? "",
      expiresIn: process.env.VENDOR_ADMIN_JWT_EXPIRES_IN ?? "12h",
    },
  },
});
