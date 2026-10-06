export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://nyayaapi.deepwebstudio.dev/api/v1';
export const APP_TITLE = 'Nyaya Admin Portal';

// Uploaded files come back as server-relative paths ("/uploads/..."), served
// from the API's origin rather than the admin portal's.
export function resolveAssetUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  return url.startsWith('/') ? new URL(url, API_BASE_URL).toString() : url;
}
