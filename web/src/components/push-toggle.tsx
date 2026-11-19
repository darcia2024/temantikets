"use client";

import { useEffect, useState } from "react";
import { subscribePush, testPush, unsubscribePush } from "@/app/admin/push-actions";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "off" | "on" | "denied";

export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    async function init(): Promise<State> {
      if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const sub = await reg.pushManager.getSubscription();
      return Notification.permission === "denied" ? "denied" : sub ? "on" : "off";
    }
    init()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, [vapidKey]);

  async function enable() {
    setMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
      await subscribePush(JSON.parse(JSON.stringify(sub)));
      setState("on");
      const n = await testPush();
      setMsg(n > 0 ? "Notifikasi tes terkirim." : "Tersimpan, tapi tes belum terkirim.");
    } catch {
      setState(Notification.permission === "denied" ? "denied" : "off");
      setMsg("Gagal mengaktifkan. Di iPhone, pasang dulu ke Home Screen (Share → Add to Home Screen).");
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await unsubscribePush(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
  }

  if (state === "loading" || state === "on") {
    return state === "on" ? (
      <p className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        Alarm time limit aktif di perangkat ini.
        <button onClick={disable} className="underline">
          Matikan
        </button>
      </p>
    ) : null;
  }
  if (state === "unsupported") return null;
  return (
    <div className="rounded-2xl bg-brand-50 p-4 text-sm ring-1 ring-brand-100">
      {state === "denied" ? (
        <p>Notifikasi diblokir di browser. Izinkan lewat pengaturan situs supaya alarm time limit bisa muncul.</p>
      ) : (
        <>
          <p className="font-medium">Aktifkan alarm di HP ini?</p>
          <p className="text-gray-600">Peringatan saat time limit HOLD tinggal 6 jam dan 2 jam, plus OK to Board yang mepet.</p>
          <button onClick={enable} className="mt-2 rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white">
            Aktifkan notifikasi
          </button>
        </>
      )}
      {msg && <p className="mt-2 text-xs text-gray-600">{msg}</p>}
    </div>
  );
}
