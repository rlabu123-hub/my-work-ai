// Keep browser capability behind an adapter for future native iOS/Android implementations.
export interface NotificationAdapter {
  supported(): boolean;
  permission(): NotificationPermission | "unsupported";
  request(): Promise<NotificationPermission | "unsupported">;
  show(title: string, body: string, tag: string): void;
}
export const browserNotifications: NotificationAdapter = {
  supported: () => typeof window !== "undefined" && "Notification" in window,
  permission() {
    return this.supported() ? Notification.permission : "unsupported";
  },
  async request() {
    return this.supported() ? Notification.requestPermission() : "unsupported";
  },
  show(title, body, tag) {
    if (this.permission() === "granted")
      new Notification(title, { body, tag, icon: "/icon-192.png" });
  },
};
