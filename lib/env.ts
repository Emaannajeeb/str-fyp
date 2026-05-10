import { config } from 'dotenv-safe';
import { z } from 'zod';

// Required environment variables
const REQUIRED_VARS = [
  'DATABASE_URL',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'JWT_SECRET',
  'SOLANA_CLUSTER',
  'SOLANA_CLUSTER_URL',
  'APP_BASE_URL',
  'ENCRYPTION_KEY_32B',
] as const;

// Load and validate environment variables
config({
  allowEmptyValues: false,
  example: './.env.example',
  path: '.env',
});

// Validate that all required variables are present
const missingVars = REQUIRED_VARS.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(', ')}\n` +
      `Please check your .env file and ensure all required variables are set.`
  );
}

// Zod schema for type-safe environment variables
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SOLANA_CLUSTER: z.enum(['mainnet-beta', 'devnet', 'testnet'], {
    errorMap: () => ({ message: 'SOLANA_CLUSTER must be one of: mainnet-beta, devnet, testnet' }),
  }),
  SOLANA_CLUSTER_URL: z.string().url('SOLANA_CLUSTER_URL must be a valid RPC endpoint URL'),
  APP_BASE_URL: z.string().url('APP_BASE_URL must be a valid URL'),
  ENCRYPTION_KEY_32B: z
    .string()
    .min(32, 'ENCRYPTION_KEY_32B must be at least 32 characters (base64 encoded)'),
  WALLET_ALLOW_MOCK: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  STREAMFLOW_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  STREAMFLOW_SENDER_PRIVATE_KEY: z.string().optional(),
  SOLANA_EXPLORER_BASE: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

// Parse and validate environment variables
export const env = envSchema.parse(process.env);

// Export type for use in other files
export type Env = z.infer<typeof envSchema>;

// Helper exports for Solana/Streamflow configuration
export const SOLANA_CLUSTER_URL = env.SOLANA_CLUSTER_URL;
export const SOLANA_CLUSTER = env.SOLANA_CLUSTER;
export const IS_DEVNET = SOLANA_CLUSTER === 'devnet';
export const SOLANA_EXPLORER_BASE =
  process.env.SOLANA_EXPLORER_BASE ?? 'https://explorer.solana.com';
export const STREAMFLOW_ENABLED = env.STREAMFLOW_ENABLED === true;
export const WALLET_ALLOW_MOCK = env.WALLET_ALLOW_MOCK === true;
