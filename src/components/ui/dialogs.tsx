"use client";

import { useEffect, useState } from "react";
import { X, AlertTriangle } from "lucide-react";

function Backdrop({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />;
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message, confirmText = "Aceptar", cancelText = "Cancelar",
  danger = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <>
      <Backdrop onClose={onCancel} />
      <div className="fixed z-[61] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-pop-in">
        <div className="flex items-start gap-4">
          {danger && (
            <div className="shrink-0 h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {message && <p className="text-sm text-slate-500 mt-1">{message}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 rounded-full text-sm font-medium text-white transition ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </>
  );
}

interface PromptDialogProps {
  open: boolean;
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  open, title, label, defaultValue = "", placeholder,
  confirmText = "Guardar", onConfirm, onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  if (!open) return null;

  const submit = () => {
    if (value.trim()) onConfirm(value.trim());
  };

  return (
    <>
      <Backdrop onClose={onCancel} />
      <div className="fixed z-[61] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 animate-pop-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded-lg transition">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        {label && <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>}
        <input
          autoFocus
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="px-5 py-2 rounded-full text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-50"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </>
  );
}
