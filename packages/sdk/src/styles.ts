export const styles = `
:host{all:initial;font-family:var(--markee-font-family);color:var(--markee-text);font-size:14px;line-height:1.5;color-scheme:var(--markee-color-scheme)}

*{box-sizing:border-box}
button,input,textarea,select{font:inherit}
button{cursor:pointer}
button:disabled{opacity:.5;cursor:wait}
button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid var(--markee-focus-ring);outline-offset:3px}

.overlay{position:fixed;inset:0;z-index:10000;background:var(--markee-overlay);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px}

.panel{background:var(--markee-background);border:1px solid var(--markee-border);border-radius:var(--markee-radius);width:min(512px,100%);max-height:92dvh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 100px #10183244;position:relative}

header{flex-shrink:0;padding:18px 24px;display:flex;gap:16px;align-items:flex-start;border-bottom:1px solid var(--markee-border)}
.brand{width:40px;height:40px;display:grid;place-items:center;border-radius:var(--markee-control-radius);background:var(--markee-primary);color:var(--markee-primary-text);font-weight:900;font-size:24px}
.grow{flex:1;min-width:0}
h1{font-size:18px;line-height:1.25;margin:0 0 4px}
h2{font-size:18px;line-height:1.3;margin:0 0 12px}
h3{font-size:16px;margin:0 0 8px}
p{margin:8px 0 14px}
.muted,small{color:var(--markee-muted)}
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.3px;font-weight:700;color:var(--markee-accent-surface-text)}
.pill{display:inline-flex;border-radius:var(--markee-small-radius);background:var(--markee-accent-surface);color:var(--markee-accent-surface-text);padding:3px 7px;font-size:11px;font-weight:700}
.close{border:0;background:none;color:var(--markee-muted);font-size:23px;padding:5px 10px;border-radius:var(--markee-small-radius)}
.nav{display:flex;gap:4px;padding:12px 24px 0;overflow:auto}
.nav button{white-space:nowrap;border:0;background:transparent;padding:10px 12px;color:var(--markee-muted);border-radius:var(--markee-control-radius);font-size:13px}
.nav button[aria-selected=true]{background:var(--markee-selected);color:var(--markee-selected-text);font-weight:650}
.content{padding:20px 24px;overflow-y:auto;overflow-x:hidden;min-height:0;overscroll-behavior:contain}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.between{justify-content:space-between}
.stack{display:grid;gap:12px}
.btn{border:1px solid var(--markee-border);border-radius:var(--markee-control-radius);background:var(--markee-surface);color:var(--markee-text);padding:10px 15px;font-weight:600;font-size:13px}
.primary{background:var(--markee-primary);border-color:var(--markee-primary);color:var(--markee-primary-text)}
.accent{background:var(--markee-accent);border-color:var(--markee-accent);color:var(--markee-accent-text)}
.review-action{position:relative;display:inline-flex;margin-left:auto}.review-action>button{width:100%}
.review-action.insufficient,.review-action.insufficient button{cursor:not-allowed}
.balance-tooltip{position:absolute;bottom:calc(100% + 8px);right:0;width:max-content;max-width:min(280px,75vw);padding:8px 12px;border:1px solid var(--markee-border);border-radius:8px;background:var(--markee-background);color:var(--markee-text);font-size:12px;line-height:1.5;z-index:2;visibility:hidden}
.balance-tooltip[hidden]{display:none}
.review-action:hover .balance-tooltip,.review-action:focus .balance-tooltip{visibility:visible}
.danger{color:var(--markee-error-text)}
.full{width:100%}
.card{border:1px solid var(--markee-border);border-radius:var(--markee-card-radius);background:var(--markee-surface);padding:17px 18px}
.winner{background:var(--markee-accent-surface);border-color:var(--markee-accent-border)}
.message{font-family:ui-monospace,monospace;font-size:15px;overflow-wrap:anywhere;white-space:pre-wrap;line-height:1.5;margin:10px 0}
.name{font-size:12px;color:var(--markee-muted)}
.meta{font-size:12px;color:var(--markee-muted)}
.stat{display:flex;justify-content:space-between;gap:16px;margin:8px 0;font-size:13px}
.stat strong{text-align:right;overflow-wrap:anywhere}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.metric{font-size:23px;font-weight:650;letter-spacing:-.6px}
.note,.error,.success{padding:12px 14px;border-radius:var(--markee-control-radius);font-size:13px;overflow-wrap:anywhere;margin-bottom:14px}
.note{background:var(--markee-info);color:var(--markee-info-text)}
.error{background:var(--markee-error);color:var(--markee-error-text)}
.moderation-warning{padding:14px 16px;border:1px solid var(--markee-warning-border);border-left-width:4px;border-radius:var(--markee-control-radius);background:var(--markee-warning);color:var(--markee-warning-text);font-size:13px;line-height:1.6;overflow-wrap:anywhere;margin:0 0 16px}.moderation-warning-title{display:flex;align-items:center;gap:9px;font-size:16px;font-weight:700;margin:0 0 8px}.moderation-warning-title svg{width:22px;height:22px;flex-shrink:0}.moderation-warning p{margin:6px 0}.moderation-warning-inline:not(:empty)::before{content:"⚠ ";font-weight:700}.moderation-warning-inline:empty{display:none}.moderation-warning-actions{margin-top:18px;flex-wrap:wrap}
.success{background:var(--markee-success);color:var(--markee-success-text)}
label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
input,textarea,select{display:block;width:100%;border:1px solid var(--markee-border);border-radius:var(--markee-control-radius);background:var(--markee-input-background);color:var(--markee-input-text);padding:12px;min-width:0}
input::placeholder,textarea::placeholder{color:var(--markee-muted);opacity:1}
textarea{font-family:ui-monospace,monospace;font-size:14px;min-height:88px;max-height:220px;resize:vertical}
form{display:grid;gap:16px}
.field small{display:block;margin-top:5px;font-weight:400;font-size:12px}
.divider{height:1px;background:var(--markee-border);margin:20px 0}
a{color:var(--markee-link);text-decoration:none;overflow-wrap:anywhere}
ul{padding-left:20px;font-size:14px}
.loading{padding:40px;text-align:center;color:var(--markee-muted)}
.empty{padding:24px 8px;text-align:center}
.spinner{display:inline-block;width:14px;height:14px;border-radius:100%;border:2px solid var(--markee-border);border-top-color:var(--markee-muted);animation:spin 1s linear infinite;margin-right:8px}
@keyframes spin{to{transform:rotate(360deg)}
}
footer{flex-shrink:0;padding:14px 20px;border-top:1px solid var(--markee-border);background:var(--markee-background);color:var(--markee-muted);font-size:11px}
.mono{font-family:ui-monospace,monospace}
.payment-review{display:grid;gap:16px}
.review-message{border:1px solid var(--markee-border);border-radius:var(--markee-card-radius);background:var(--markee-input-background);padding:16px 18px;min-width:0}
.review-message .message{font-size:14px;margin:0}
.review-summary{padding:0 4px}
.review-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid var(--markee-border);font-size:13px}
.review-row:last-child{border-bottom:0}
.review-row>span{color:var(--markee-muted)}
.review-row strong{text-align:right;font-family:ui-monospace,monospace;font-size:13px;overflow-wrap:anywhere}
.review-callout{padding:16px;border:1px solid var(--markee-accent-border);border-radius:var(--markee-control-radius);background:var(--markee-accent-surface);color:var(--markee-accent-surface-text)}
.review-callout strong{display:block;font-family:ui-monospace,monospace;font-size:13px;line-height:1.45}
.review-callout p{margin:6px 0 0;font-size:12px;line-height:1.5}
.review-details{font-size:11px;color:var(--markee-muted)}
.review-details summary{cursor:pointer;color:var(--markee-link);font-size:12px}
.review-details .review-row{font-size:11px;padding:7px 0}
.review-details .review-row strong{font-size:11px;color:var(--markee-text)}
.review-address{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
.review-copy{padding:3px 7px;font-size:10px;line-height:1.3;color:var(--markee-link);white-space:nowrap}
.review-details p{margin:8px 0}
.review-footer .footer-actions{justify-content:flex-end}
.review-footer .footer-actions>.primary:last-child{margin-left:0}
.wallets{display:grid;gap:10px}


.header-caption{font-size:12px;color:var(--markee-muted);margin:5px 0 0}
.close{line-height:1;padding:4px 6px;flex-shrink:0}
.text-button{border:0;background:transparent;color:var(--markee-link);padding:0;font-size:12px;font-weight:500;text-align:left}
.compact{padding:5px 9px;font-size:11px;line-height:1.4}
.leaderboard{border:1px solid var(--markee-border);border-radius:var(--markee-control-radius);padding:12px 14px;background:var(--markee-surface);margin-bottom:20px}
.leaderboard>.row{gap:8px}.leaderboard a{font-size:11px}.leaderboard .text-button{color:var(--markee-muted)}.chevron{display:inline-block;width:15px;font-size:16px}
.leaderboard-list{display:grid;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid var(--markee-border)}
.leaderboard-entry{display:flex;gap:12px;align-items:center;justify-content:space-between;border:1px solid var(--markee-border);border-radius:var(--markee-control-radius);padding:10px}
.selected-entry{border-color:var(--markee-link)}.leaderboard-entry .message{font-size:12px;line-height:1.5;margin:0}.entry-caption{gap:5px;margin-top:5px}.entry-caption:empty{display:none}.entry-caption .pill{font-size:9px}.entry-caption .name,.entry-caption .meta{font-size:10px}
.entry-funding{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:0 0 auto;max-width:44%;text-align:right;overflow-wrap:anywhere}.entry-funding .meta{font-size:10px}
.message-card{padding:16px;border:1px solid var(--markee-border);border-radius:var(--markee-card-radius);background:var(--markee-surface);min-width:0}
.message-card.winner{background:var(--markee-accent-surface);border-color:var(--markee-accent-border)}
.message-card>.message{font-size:17px;margin:12px 0 6px}.message-card .eyebrow{font-size:10px}.message-card>.name{margin:4px 0}
.leaderboard-entry .message.moderation-placeholder,.message-card>.message.moderation-placeholder{font-family:var(--markee-font-family);font-size:12px;font-weight:500;line-height:1.45;color:var(--markee-muted);background:var(--markee-background);border:1px dashed var(--markee-border);border-radius:var(--markee-small-radius);padding:8px 10px}
.message-tools{margin-top:12px;gap:10px 16px}.message-tools .text-button{font-size:11px}.editor-card{display:grid;gap:16px}
.field label{display:flex;align-items:baseline;justify-content:space-between;gap:8px}.field-count{font-size:10px;font-weight:400;color:var(--markee-muted)}.field small{font-size:10px}
.message-stats{border-top:1px solid var(--markee-border);margin-top:16px;padding-top:12px}.message-stats>.meta{font-size:11px}.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px}.stats-grid>div{min-width:0}.stats-grid strong{display:block;font-family:ui-monospace,monospace;font-size:12px;overflow-wrap:anywhere}.stat-label{display:block;font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:var(--markee-muted);margin-bottom:4px}
.funding-card{border:1px solid var(--markee-link);border-radius:var(--markee-card-radius);background:var(--markee-surface);padding:16px;min-width:0}
.funding-card>label{font-size:11px;color:var(--markee-muted);font-weight:500;margin-bottom:8px}.amount-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.amount-value{display:flex;gap:6px;align-items:baseline;min-width:0;flex:1 1 140px}.amount-value input{background:transparent;border:0;border-radius:2px;box-shadow:none;font-family:ui-monospace,monospace;font-size:23px;font-weight:600;min-width:0;width:100%;padding:3px 0;color:var(--markee-text)}.amount-value>span{font-size:11px;color:var(--markee-muted);white-space:nowrap}.amount-presets{display:flex;gap:6px;margin-left:auto}.amount-presets button{color:var(--markee-link)}.amount-presets button[aria-pressed=true]{border-color:var(--markee-link);background:var(--markee-selected);color:var(--markee-selected-text)}
.funding-caption{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 10px;margin-top:9px;color:var(--markee-muted);font-size:10px}.funding-tools{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;border-top:1px solid var(--markee-border);margin-top:13px;padding-top:12px}.funding-tools .meta{font-size:10px}.funding-hint{font-size:11px;margin:0}.funding-hint+.note{margin:0;font-size:11px}
.footer-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.footer-actions>.primary:last-child{margin-left:auto}.footer-actions:empty{display:none}.footer-meta{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-top:10px;font-size:10px}.footer-meta .text-button{font-size:10px}
.payment-choice-footer .footer-actions{justify-content:flex-end}.payment-choice-footer .footer-actions>.primary:last-child{margin-left:0}

@media(max-width:560px){.overlay{padding:8px;align-items:flex-end}
.panel{border-radius:var(--markee-radius) var(--markee-radius) var(--markee-control-radius) var(--markee-control-radius);max-height:94dvh}
.content{padding:20px 18px}
header{padding:20px 18px}
.nav{padding-left:10px;padding-right:10px}
.grid{grid-template-columns:1fr 1fr}
.metric{font-size:19px}
footer{padding:12px 18px}
.btn{padding:10px 12px}
.compact{padding:5px 9px}.text-button{padding:0}.footer-actions>.btn{flex:1;white-space:normal}.footer-actions>.primary:last-child{margin-left:0}
.review-footer .footer-actions>.btn{flex:0 1 auto}
.payment-choice-footer .footer-actions>.btn{flex:0 1 auto}
}

@media(prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important}
}

`;
