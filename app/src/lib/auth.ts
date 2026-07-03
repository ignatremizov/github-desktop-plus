import { Account } from '../models/account'

/** Get the auth key for the user. */
export function getKeyForAccount(account: Account): string {
  return getKeyForEndpoint(account.endpoint, account.login)
}

function getKeychainAppName(): string {
  const override = __DEV__
    ? process.env.GITHUB_DESKTOP_PLUS_KEYCHAIN_APP_NAME
    : undefined

  if (override != null && override.length > 0) {
    return override
  }

  return __DEV__ ? 'GitHub Desktop Plus Dev' : 'GitHub Desktop Plus'
}

/** Get the auth key for the endpoint. */
export function getKeyForEndpoint(endpoint: string, login: string): string {
  // Don't modify this string! This is used for storing the password in the keychain
  const appName = getKeychainAppName()

  return `${appName} - ${endpoint} - ${login}`
}
