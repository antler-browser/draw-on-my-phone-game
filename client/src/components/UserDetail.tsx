import { useState } from 'react'
import { Avatar } from './Avatar'
import { SocialPlatform, getPlatforSVGIcon, getFullURL } from '@internal/shared'
export type { User }

interface User {
  id: number
  did: string
  name: string
  avatar: string | null
  socials: string | null
  createdAt: string
}

interface UserDetailProps {
  user: User
  onBack: () => void
  isCurrentUser?: boolean
  getProfileJwt: () => Promise<string | undefined>
}

interface SocialLinkRowProps {
  platform: string
  handle: string
}

function SocialLinkRow({ platform, handle }: SocialLinkRowProps) {
  const svgIcon = getPlatforSVGIcon(platform as SocialPlatform)
  const url = getFullURL(platform as SocialPlatform, handle)

  if (!url) {
    return null
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 text-gray-700 flex-shrink-0">
          {svgIcon ? (
            <div
              className="w-full h-full"
              dangerouslySetInnerHTML={{ __html: svgIcon }}
            />
          ) : (
            <span className="text-xs">{platform}</span>
          )}
        </div>
        <span className="text-gray-800 font-medium">{handle}</span>
      </div>
      <svg
        className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    </a>
  )
}

export function UserDetail({ user, onBack, isCurrentUser, getProfileJwt }: UserDetailProps) {
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRemoveMyself = async () => {
    const profileJwt = await getProfileJwt()
    
    if (!profileJwt) {
      setError('No profile JWT available')
      return
    }

    setIsRemoving(true)
    setError(null)

    try {
      const response = await fetch('/api/remove-user', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profileJwt }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to remove user')
      }

      // Success - go back to the main view
      onBack()
    } catch (err) {
      console.error('Error removing user:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove user')
      setIsRemoving(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Close button */}
      <div className="flex justify-end p-4">
        <button
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all"
          aria-label="Close"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Profile Section */}
      <div className="flex flex-col items-center px-6 pb-6">
        <Avatar avatar={user.avatar} name={user.name} size="lg" />
        <h1 className="text-3xl font-bold text-gray-900 mt-4">{user.name}</h1>
      </div>

      {/* Social Links */}
      {user.socials && user.socials.length > 0 && (
        <div className="mt-8 max-w-md mx-auto">
          <div className="divide-y divide-gray-100">
            {user.socials.split(';').map((social) => {
              const [platform, handle] = social.split(':')
              return (
                <SocialLinkRow key={social} platform={platform} handle={handle} />
              )
            })}
          </div>
        </div>
      )}

      {/* Remove Myself Button - Only shown for current user */}
      {isCurrentUser && (
        <div className="mt-8 max-w-md mx-auto px-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={handleRemoveMyself}
            disabled={isRemoving}
            className="text-center w-full text-red-600 hover:text-red-700 disabled:text-red-300 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {isRemoving ? 'Removing...' : 'Remove Myself from Meetup'}
          </button>
        </div>
      )}
    </div>
  )
}
