'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X, LoaderCircle, Check, ArrowUpRight } from 'lucide-react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {!compact && (
        <span>
          relay<span className="brand-dot">.</span>
        </span>
      )}
    </div>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red';
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Button({
  children,
  onClick,
  disabled,
  variant = 'secondary',
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  className?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={`button ${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Loading({ text = 'Opening your workspace…' }: { text?: string }) {
  return (
    <div className="loading">
      <Logo />
      <LoaderCircle size={24} className="spin" />
      <p>{text}</p>
    </div>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={onClose}
    >
      <div className="modal-header">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Step({
  number,
  label,
  done,
  active,
  onClick,
}: {
  number: number;
  label: string;
  done: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`step ${done ? 'done' : ''} ${active ? 'active' : ''}`} onClick={onClick}>
      <span>{done ? <Check size={13} /> : String(number).padStart(2, '0')}</span>
      {label}
    </button>
  );
}
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="external-link">
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
export function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function display(value: unknown): string {
  return value === null || value === undefined
    ? 'null'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
}
export function time(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
