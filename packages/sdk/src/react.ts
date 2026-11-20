'use client';
import { createElement, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { MarkeeClient, moderationParams } from './client.js';
import { createMarkee } from './modal.js';
import { createMarkeeSign, type MarkeeSignOptions } from './sign.js';
import type { SDKOptions } from './types.js';
import type { PlacementInput } from './types.js';
import { resolvePlacementInput } from './placement-input.js';

export type MarkeeModalProps = SDKOptions & PlacementInput & { open: boolean; onClose(): void };
/** No wagmi, ConnectKit, Privy, or React provider is required by this wrapper. */
export function MarkeeModal(props: MarkeeModalProps) {
  const placement = resolvePlacementInput(props);
  const current = useRef(props); current.current = props;
  const instanceRef = useRef<ReturnType<typeof createMarkee>>();
  const placementKey = JSON.stringify(placement);
  const moderationKey = JSON.stringify(moderationParams(props.moderation));
  useEffect(() => {
    if (!props.siteUrl) return;
    const client = new MarkeeClient({ apiUrl: props.apiUrl, fetch: props.fetch, siteUrl: props.siteUrl,
      onSiteVerification: result => current.current.onSiteVerification?.(result) });
    if (placement.kind === 'board') client.registerSite(placement);
  }, [props.siteUrl, props.apiUrl, props.fetch, placementKey]);
  useLayoutEffect(() => {
    if (!props.open) return;
    const instance = createMarkee({ apiUrl: props.apiUrl, fetch: props.fetch, theme: current.current.theme, moderation: props.moderation, checkoutWindow: props.checkoutWindow, allowedStrategies: props.allowedStrategies,
      wallet: props.wallet ? { getProvider: () => current.current.wallet!.getProvider(), connect: () => {
        const connect = current.current.wallet?.connect;
        if (!connect) return Promise.reject(new Error('Connect the app wallet first.'));
        return connect();
      } } : undefined,
      onEvent: event => current.current.onEvent?.(event),
    });
    instanceRef.current = instance;
    let disposing = false;
    instance.open({ placement, onClose: () => { if (!disposing) current.current.onClose(); } });
    return () => { disposing = true; instance.close(); instanceRef.current = undefined; };
  }, [props.open, props.apiUrl, props.fetch, props.checkoutWindow, JSON.stringify(props.allowedStrategies), moderationKey, !!props.wallet, placementKey]);
  useEffect(() => { instanceRef.current?.setTheme(props.theme); }, [props.theme]);
  return placement.kind === 'board' ? createElement('span', { hidden: true, 'data-markee-address': placement.address }) : null;
}

export function MarkeeButton({ children = 'Open Markee', onClick, ...props }: { children?: ReactNode; onClick(): void; className?: string; disabled?: boolean }) {
  return createElement('button', { ...props, type: 'button', onClick }, children);
}

export type MarkeeSignProps = MarkeeSignOptions & { className?: string };
/** The current sign, including Markee-hosted moderation, without an app-side data provider. */
export function MarkeeSign(props: MarkeeSignProps) {
  const placement = resolvePlacementInput(props);
  const container = useRef<HTMLDivElement>(null);
  const current = useRef(props); current.current = props;
  const instance = useRef<ReturnType<typeof createMarkeeSign>>();
  const placementKey = JSON.stringify(placement);
  const moderationKey = JSON.stringify(moderationParams(props.moderation));
  useLayoutEffect(() => {
    if (!container.current) return;
    const sign = createMarkeeSign(container.current, { ...current.current, wallet: current.current.wallet ? {
      getProvider: () => current.current.wallet!.getProvider(),
      connect: () => current.current.wallet?.connect?.() ?? Promise.reject(new Error('Connect the app wallet first.')),
    } : undefined,
    onEvent: event => current.current.onEvent?.(event),
    onOpen: current.current.onOpen ? () => current.current.onOpen?.() : undefined,
    onSiteVerification: result => current.current.onSiteVerification?.(result),
    });
    instance.current = sign;
    return () => { sign.destroy(); instance.current = undefined; };
  }, [placementKey, props.apiUrl, props.fetch, props.showAction, moderationKey, props.refreshIntervalMs, props.siteUrl, !!props.wallet, !!props.onOpen]);
  useEffect(() => { instance.current?.setTheme(props.theme); }, [props.theme]);
  return createElement('div', { ref: container, className: props.className },
    placement.kind === 'board' ? createElement('span', { hidden: true, 'data-markee-address': placement.address }) : null);
}
