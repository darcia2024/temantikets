// Service worker: shows push notifications and opens the related page on tap.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Temantiket", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Temantiket", {
      body: data.body,
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/brand/mark-white.png",
      data: { url: data.url || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === url && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
