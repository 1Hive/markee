import Twemoji from 'react-twemoji'

interface EmojiProps {
  children: string
  className?: string
}

export function Emoji({ children, className }: EmojiProps) {
  return (
    <Twemoji 
      options={{ 
        className: className || 'inline-block align-middle',
        folder: 'svg',
        ext: '.svg'
      }}
    >
      {children}
    </Twemoji>
  )
}
