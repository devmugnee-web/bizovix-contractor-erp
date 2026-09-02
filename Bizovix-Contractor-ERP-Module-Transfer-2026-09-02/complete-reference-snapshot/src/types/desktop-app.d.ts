export {};

declare global {
  interface Window {
    desktopApp?: {
      platform: string;
      isDesktop: boolean;
      minimize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      toggleMaximize: () => Promise<boolean>;
      onWindowStateChange: (callback: (payload: { isMaximized: boolean }) => void) => () => void;
      chooseServerMode?: () => Promise<void>;
      chooseClientMode?: (host: string) => Promise<void>;
      getNetworkInfo?: () => Promise<{
        mode: "server" | "client";
        allowLan: boolean;
        addresses: Array<{ name: string; address: string }>;
      }>;
      setLanSharing?: (enabled: boolean) => Promise<void>;
    };
  }
}
