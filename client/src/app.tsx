import { useState, useEffect } from 'react'
import { decodeAndVerifyJWT } from '@meetup/shared'
import { QRCodePanel } from './components/QRCodePanel'
import { UserList } from './components/UserList'
import { UserDetail, type User } from './components/UserDetail'
import data from '../../data.json'

// TypeScript declarations for IRL Browser API
declare global {
  interface Window {
    irlBrowser?: {
      getProfileDetails(): Promise<string>;
      getAvatar(): Promise<string | null>;
      getBrowserDetails(): {
        name: string;
        version: string;
        platform: 'ios' | 'android';
        supportedPermissions: string[];
      };
      requestPermission(permission: string): Promise<boolean>;
      close(): void;
    };
  }
}

// Helper function to detect iOS or Android
const isMobileDevice = () => {
  const userAgent = navigator.userAgent || (window as any).opera || '';
  
  // Check for iOS
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
  
  // Check for Android
  const isAndroid = /android/i.test(userAgent);
  
  return isIOS || isAndroid;
}

export function App() {
  const [profile, setProfile] = useState<User | null>(null)
  const [isIRLBrowser, setIsIRLBrowser] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<User[] | null>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  useEffect(() => {
    // Check if running in an IRL Browser
    setIsIRLBrowser(!!window.irlBrowser)

    // Fetch all users from the database
    fetchUsers()

    // Connect to WebSocket for real-time updates
    const ws = connectToWebSocket()

    // Get profile details immediately
    loadProfile()

    // Load avatar
    loadAvatar()

    // Cleanup on unmount
    return () => {
      ws?.close()
    }
  }, [])

  const loadProfile = async () => {
    try {
      if (!window.irlBrowser) {
        console.log('IRL Browser not found')
        return
      }
      // Get profile details JWT
      const profileJwt = await window.irlBrowser.getProfileDetails()

      // Add user to the database
      addUserToDatabase(profileJwt)

      // Decode and verify the profile JWT
      const profilePayload = await decodeAndVerifyJWT(profileJwt)

      if (!profilePayload) {
        console.log('No profile found');
        return;
      }

      setProfile(profilePayload.data as User)

    } catch (err) {
      console.error('Error loading profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    }
  }

  const loadAvatar = async () => {
    try {
      if (!window.irlBrowser) {
        return
      }
      // Get avatar separately (returns a signed JWT)
      const avatarJWT = await window.irlBrowser.getAvatar()
      if (!avatarJWT) { return }
      addAvatarToDatabase(avatarJWT)
    } catch (err) {
      console.error('Error loading avatar:', err)
      // Don't set error state for avatar failures, just log them
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users')
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      const data = await response.json()
      const fetchedUsers = data.users as User[]

      // Merge fetched users with existing state (deduplicate by DID)
      setUsers((prev) => {
        const merged = [...(prev ?? [])] as User[]
        if (merged.length === 0) { return fetchedUsers } // If no users, return the fetched users
        for (const user of fetchedUsers) {
          const existingIndex = merged.findIndex((u) => u.did === user.did)
          if (existingIndex >= 0) {
            // Update existing user in place
            merged[existingIndex] = user
          } else {
            // Add new user to bottom
            merged.push(user)
          }
        }
        return merged
      })
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  const addUserToDatabase = async (profileJwt: string) => {
    try {
      const response = await fetch('/api/add-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profileJwt }),
      })

      if (!response.ok) {
        throw new Error('Failed to check in')
      }

      await response.json()
    } catch (err) {
      console.error('Error adding user to database:', err)
      // Don't show error to user, they'll still see the user list
    }
  }

  const addAvatarToDatabase = async (avatarJwt: string) => {
    try {
      const response = await fetch('/api/add-avatar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatarJwt }),
      })

      if (!response.ok) {
        throw new Error('Failed to check in')
      }

      await response.json()
    } catch (err) {
      console.error('Error adding user to database:', err)
      // Don't show error to user, they'll still see the user list
    }
  }

  const connectToWebSocket = () => {
    try {
      // Construct WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/ws`

      const ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('WebSocket connected')
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)

          switch (message.type) {
            case 'connected':
              console.log('Connected to meetup broadcaster:', message)
              break

            case 'user-joined':
              const user = message.data as User

              // Add or update user in the list
              setUsers((prev) => {
                const merged = [...(prev ?? [])] as User[]
                const exists = merged.find((u) => u.did === user.did)
                if (exists) {
                  // Update existing user in place (keep position)
                  return merged.map((u) => (u.did === user.did ? user : u))
                } else {
                  // Add new user to bottom
                  return [...merged, user]  
                }
              })
              break

            case 'user-left':
              const { did } = message.data as { did: string }

              // Remove user from the list
              setUsers((prev) => prev?.filter((u) => u.did !== did) ?? [])

              // If the selected user left, clear the selection
              setSelectedUser((prev) => (prev?.did === did ? null : prev))
              break

            case 'meetup-ended':
              console.log('Meetup ended:', message.data)
              // Optionally show a message to the user
              break

            default:
              console.log('Unknown message type:', message.type)
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason)
        // Optionally implement reconnection logic here
      }

      return ws
    } catch (err) {
      console.error('Error connecting to WebSocket:', err)
      return null
    }
  }

  // Show loading state while waiting for users query to complete
  if (!users) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="grid md:grid-cols-2 min-h-screen">
          <QRCodePanel />
          <div className="flex items-center justify-center px-4"></div>
        </div>
      </div>
    )
  }

   // Show fallback message user is scans with a regular browser (not an IRL Browser like Antler)
   if (!isIRLBrowser && isMobileDevice()) {
    return (
      <div className="min-h-screen bg-white">
        <div className="grid md:grid-cols-2 min-h-screen">
          <QRCodePanel />
          <div className="flex items-center justify-center px-4 py-12">
            <div className="text-center max-w-2xl">
              <div className="flex justify-center mb-8">
                <div className="max-w-[150px] md:max-w-[200px]">
                  <img
                    src="https://ax0.taddy.org/antler/antler-icon.webp"
                    alt="Antler"
                    className="w-full h-auto rounded-3xl shadow-lg"
                  />
                </div>
              </div>

              {/* Hero Title */}
              <h2 className="text-3xl md:text-4xl font-bold text-[#403B51] mb-8 leading-tight">
                Scan with Antler!
              </h2>

              {/* Download Buttons */}
              <div className="flex flex-wrap justify-center gap-4 mt-8">
                <a
                  href="https://apps.apple.com/app/id6753969350"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block transition-transform hover:-translate-y-1 active:scale-95"
                >
                  <img
                    src="https://ax0.taddy.org/general/apple-app-store-badge.png"
                    alt="Download on the App Store"
                    className="h-12 md:h-14 w-auto"
                  />
                </a>
                <a
                  href="https://play.google.com/store/apps/details?id=com.antlerbrowser"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block transition-transform hover:-translate-y-1 active:scale-95"
                >
                  <img
                    src="https://ax0.taddy.org/general/google-play-badge.png"
                    alt="Download on Google Play"
                    className="h-12 md:h-14 w-auto"
                  />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50">
        <div className="grid md:grid-cols-2 min-h-screen">
          <QRCodePanel />
          <div className="flex items-center justify-center px-4">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-6">⚠️</div>
              <h1 className="text-3xl font-bold mb-4 text-gray-800">Error</h1>
              <p className="text-gray-600">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show user detail if a user is selected
  if (selectedUser) {
    return (
      <UserDetail
        user={selectedUser}
        onBack={() => setSelectedUser(null)}
        isCurrentUser={profile?.did === selectedUser.did}
        getProfileJwt={async () => await window.irlBrowser?.getProfileDetails()}
      />
    )
  }

  // Show attendee list
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="grid md:grid-cols-2 min-h-screen">
        <QRCodePanel />
        <div className="flex px-4 py-8">
          <div className="w-full max-w-2xl mx-auto mt-10">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-6 text-gray-800">
                Hey! {data.title}
              </h1>
            </div>

            {/* User List */}
            <div className="mt-6">
              <UserList users={users} onUserClick={(user) => setSelectedUser(user)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
