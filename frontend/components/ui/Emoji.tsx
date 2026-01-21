import Twemoji from 'react-twemoji'

interface EmojiProps {
  children: string
  className?: string
}

export function Emoji({ children, className = '' }: EmojiProps) {
  return (
    <span className={className}>
      <Twemoji 
        options={{ 
          className: 'emoji',
          folder: 'svg',
          ext: '.svg'
        }}
      >
        {children}
      </Twemoji>
    </span>
  )
}
