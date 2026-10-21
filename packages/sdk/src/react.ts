'use client';
import { createElement, useEffect, useRef, type ReactNode } from 'react';
import { MarkeeClient } from './client.js';
import { createMarkee } from './modal.js';
import type { Placement, SDKOptions } from './types.js';

export interface MarkeeModalProps extends SDKOptions { open: boolean; placement: Placement; onClose(): void }
/** No wagmi, ConnectKit, Privy, or React provider is required by this wrapper. */
export function MarkeeModal(props: MarkeeModalProps) {
  const current = useRef(props); current.current = props;
  const instanceRef = useRef<ReturnType<typeof createMarkee>>();
  const placementKey = JSON.stringify(props.placement);
  useEffect(() => {
    if (!props.siteUrl) return;
    const client = new MarkeeClient({ apiUrl: props.apiUrl, fetch: props.fetch, siteUrl: props.siteUrl,
      onSiteVerification: result => current.current.onSiteVerification?.(result) });
    client.registerSite(props.placement);
  }, [props.siteUrl, props.apiUrl, props.fetch, placementKey]);
  useEffect(() => {
    if (!props.open) return;
    const instance = createMarkee({ apiUrl: props.apiUrl, fetch: props.fetch, theme: current.current.theme,
      wallet: props.wallet ? { getProvider: () => current.current.wallet!.getProvider(), connect: () => {
        const connect = current.current.wallet?.connect;
        if (!connect) return Promise.reject(new Error('Connect the app wallet first.'));
        return connect();
      } } : undefined,
      onEvent: event => current.current.onEvent?.(event),
    });
    instanceRef.current = instance;
    let disposing = false;
    instance.open({ placement: props.placement, onClose: () => { if (!disposing) current.current.onClose(); } });
    return () => { disposing = true; instance.close(); instanceRef.current = undefined; };
  }, [props.open, props.apiUrl, props.fetch, !!props.wallet, placementKey]);
  useEffect(() => { instanceRef.current?.setTheme(props.theme); }, [props.theme]);
  return props.placement.kind === 'board' ? createElement('span', { hidden: true, 'data-markee-address': props.placement.address }) : null;
}

export function MarkeeButton({ children = 'Open Markee', onClick, ...props }: { children?: ReactNode; onClick(): void; className?: string; disabled?: boolean }) {
  return createElement('button', { ...props, type: 'button', onClick }, children);
}
