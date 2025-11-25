import { Avatar } from './Avatar'
import { SocialPlatform, getPlatforSVGIcon, getFullURL } from '@internal/shared'
import type { User } from './UserDetail'

interface UserListProps {
  users: User[]
  onUserClick?: (user: User) => void
}

interface SocialIconProps {
  platform: string
  handle: string
}

function SocialIcon({ platform, handle }: SocialIconProps) {
  const svgIcon = getPlatforSVGIcon(platform as SocialPlatform)
  const url = getFullURL(platform as SocialPlatform, handle)

  if (!url) {
    return null
  }

  // If no icon is available, show a text badge fallback
  if (!svgIcon) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors"
        title={`${platform}: ${handle}`}
      >
        {platform}
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center justify-center w-6 h-6 text-gray-600 hover:text-gray-900 hover:scale-110 transition-all"
      title={`${platform}: ${handle}`}
      aria-label={`${platform}: ${handle}`}
    >
      <div
        className="w-5 h-5"
        dangerouslySetInnerHTML={{ __html: svgIcon }}
      />
    </a>
  )
}

export function UserList({ users, onUserClick }: UserListProps) {
  if (users.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto px-6 py-16">
        <div className="text-center space-y-4">
          {/* <div className="text-4xl mb-6"></div> */}
          <h2 className="text-2xl font-bold text-gray-900 mb-20">
          🌟 Scan the QR code 🌟 
          </h2>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-xl text-gray-700 mb-2">
          Scan the QR code and see who else is here!
        </h2>
      </div>
      <div className="space-y-3 lg:mx-10">
        {users.map((user) => {
          return (
            <div
              key={user.did}
              onClick={() => onUserClick?.(user)}
              className="flex items-center gap-4 p-4 rounded-lg shadow-sm transition-all bg-white hover:shadow-md cursor-pointer"
            >
              <div className="flex-shrink-0">
                <Avatar avatar={user.avatar} name={user.name} size="md" />
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800 truncate">
                    {user.name}
                  </h3>
                </div>
                {user.socials && user.socials.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {user.socials?.split(';').map((social) => {
                      const [platform, handle] = social.split(':')
                      return (
                        <SocialIcon
                          key={social}
                          platform={platform}
                          handle={handle}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}