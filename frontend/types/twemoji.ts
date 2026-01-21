declare module 'react-twemoji' {
  import { ReactNode } from 'react'

  interface TwemojiOptions {
    className?: string
    folder?: string
    ext?: string
  }

  interface TwemojiProps {
    children: ReactNode
    options?: TwemojiOptions
  }

  export default function Twemoji(props: TwemojiProps): JSX.Element
}
















