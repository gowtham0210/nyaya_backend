type AuthBridge = {
  getAccessToken: () => string | null;
  refreshSession: () => Promise<string | null>;
  handleSessionExpired: () => void;
};

let bridge: AuthBridge = {
  getAccessToken: () => null,
  refreshSession: async () => null,
  handleSessionExpired: () => undefined,
};

export function registerAuthBridge(nextBridge: AuthBridge) {
  bridge = nextBridge;
}

export function getAuthBridge() {
  return bridge;
}
