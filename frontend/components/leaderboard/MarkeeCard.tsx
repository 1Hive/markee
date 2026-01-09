15:28:02.949 Running build in Washington, D.C., USA (East) – iad1
15:28:02.950 Build machine configuration: 4 cores, 8 GB
15:28:03.048 Cloning github.com/1Hive/markee (Branch: main, Commit: e52188d)
15:28:03.271 Cloning completed: 223.000ms
15:28:04.963 Restored build cache from previous deployment (8EJw6o2FAGqBYsDck6DM2ks7nVaB)
15:28:06.673 Running "vercel build"
15:28:07.117 Vercel CLI 50.1.6
15:28:07.409 Running "install" command: `npm install`...
15:28:09.268 
15:28:09.268 up to date, audited 886 packages in 2s
15:28:09.268 
15:28:09.268 202 packages are looking for funding
15:28:09.269   run `npm fund` for details
15:28:09.269 
15:28:09.269 found 0 vulnerabilities
15:28:09.300 Detected Next.js version: 14.2.35
15:28:09.301 Running "npm run build"
15:28:09.416 
15:28:09.416 > markee-frontend@0.1.0 build
15:28:09.416 > next build
15:28:09.417 
15:28:10.097   ▲ Next.js 14.2.35
15:28:10.097 
15:28:10.150    Creating an optimized production build ...
15:28:10.222  ⚠ Found lockfile missing swc dependencies, run next locally to automatically patch
15:28:23.621 Failed to compile.
15:28:23.622 
15:28:23.622 ./components/leaderboard/MarkeeCard.tsx
15:28:23.622 Error: 
15:28:23.623   [31mx[0m Expected a semicolon
15:28:23.623      ,-[[36;1;4m/vercel/path0/frontend/components/leaderboard/MarkeeCard.tsx[0m:143:1]
15:28:23.623  [2m143[0m |   })
15:28:23.623  [2m144[0m | 
15:28:23.624  [2m145[0m |   const hasMinBalance = balance ? balance >= MARKEE_THRESHOLD : false
15:28:23.624  [2m146[0m |     <div className="relative">
15:28:23.624      : [31;1m         ^^^^^^^^^[0m
15:28:23.624  [2m147[0m |       <EmojiOverlay
15:28:23.624  [2m148[0m |         reactions={reactions}
15:28:23.624  [2m149[0m |         markee={markee}
15:28:23.624      `----
15:28:23.624 
15:28:23.624   [31mx[0m Unterminated regexp literal
15:28:23.624      ,-[[36;1;4m/vercel/path0/frontend/components/leaderboard/MarkeeCard.tsx[0m:152:1]
15:28:23.624  [2m152[0m |         onRemoveReaction={onRemoveReaction}
15:28:23.624  [2m153[0m |         hasMinBalance={hasMinBalance}
15:28:23.624  [2m154[0m |       />
15:28:23.624  [2m155[0m |     </div>
15:28:23.624      : [31;1m     ^^^^^[0m
15:28:23.624  [2m156[0m |   )
15:28:23.624  [2m157[0m | }
15:28:23.624      `----
15:28:23.624 
15:28:23.625 Caused by:
15:28:23.625     Syntax Error
15:28:23.625 
15:28:23.625 Import trace for requested module:
15:28:23.625 ./components/leaderboard/MarkeeCard.tsx
15:28:23.625 ./app/page.tsx
15:28:23.625 
15:28:23.625 
15:28:23.625 > Build failed because of webpack errors
15:28:23.696 Error: Command "npm run build" exited with 1
