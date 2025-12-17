'use client'

export function MarkeeCardSkeleton({ size }: { size: 'hero' | 'large' | 'medium' | 'list' }) {
  if (size === 'hero') {
    return (
      <div className="bg-gradient-to-r from-[#F897FE]/20 to-[#7C9CFF]/20 rounded-xl shadow-lg p-8 mb-6 border-4 border-[#F897FE] animate-pulse">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="w-24 h-16 bg-[#8A8FBF]/30 rounded mb-2"></div>
            <div className="w-3/4 h-8 bg-[#8A8FBF]/30 rounded mb-4"></div>
            <div className="flex items-center gap-6">
              <div className="w-32 h-6 bg-[#8A8FBF]/30 rounded"></div>
              <div className="w-24 h-6 bg-[#8A8FBF]/30 rounded"></div>
              <div className="w-28 h-6 bg-[#8A8FBF]/30 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (size === 'large') {
    return (
      <div className="bg-[#0A0F3D] rounded-lg shadow-md p-6 border-2 border-[#8A8FBF]/30 h-full animate-pulse">
        <div className="flex items-start justify-between mb-3">
          <div className="w-12 h-8 bg-[#8A8FBF]/30 rounded"></div>
        </div>
        <div className="w-full h-6 bg-[#8A8FBF]/30 rounded mb-2"></div>
        <div className="w-3/4 h-6 bg-[#8A8FBF]/30 rounded mb-3"></div>
        <div className="flex items-center justify-between">
          <div className="w-24 h-5 bg-[#8A8FBF]/30 rounded"></div>
          <div className="w-20 h-5 bg-[#8A8FBF]/30 rounded"></div>
        </div>
      </div>
    )
  }

  if (size === 'medium') {
    return (
      <div className="bg-[#0A0F3D] rounded-lg shadow-sm p-4 border border-[#8A8FBF]/30 h-full animate-pulse">
        <div className="flex items-start justify-between mb-2">
          <div className="w-10 h-6 bg-[#8A8FBF]/30 rounded"></div>
        </div>
        <div className="w-full h-4 bg-[#8A8FBF]/30 rounded mb-2"></div>
        <div className="w-2/3 h-4 bg-[#8A8FBF]/30 rounded mb-2"></div>
        <div className="flex items-center justify-between">
          <div className="w-20 h-4 bg-[#8A8FBF]/30 rounded"></div>
          <div className="w-16 h-4 bg-[#8A8FBF]/30 rounded"></div>
        </div>
      </div>
    )
  }

  // list
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#8A8FBF]/20 animate-pulse">
      <div className="flex items-center gap-4 flex-1">
        <div className="w-8 h-4 bg-[#8A8FBF]/30 rounded"></div>
        <div className="w-64 h-4 bg-[#8A8FBF]/30 rounded"></div>
        <div className="w-24 h-4 bg-[#8A8FBF]/30 rounded"></div>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-[#8A8FBF]/30"></div>
        <div className="w-20 h-4 bg-[#8A8FBF]/30 rounded"></div>
      </div>
    </div>
  )
}

export function LeaderboardSkeleton() {
  return (
    <>
      {/* Hero skeleton */}
      <MarkeeCardSkeleton size="hero" />
      
      {/* Two large skeletons */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <MarkeeCardSkeleton size="large" />
        <MarkeeCardSkeleton size="large" />
      </div>
      
      {/* Grid of medium skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <MarkeeCardSkeleton key={i} size="medium" />
        ))}
      </div>
      
      {/* List skeletons */}
      <div className="bg-[#0A0F3D] rounded-lg shadow-sm p-6 border border-[#8A8FBF]/20">
        <div className="w-32 h-6 bg-[#8A8FBF]/30 rounded mb-4 animate-pulse"></div>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <MarkeeCardSkeleton key={i} size="list" />
          ))}
        </div>
      </div>
    </>
  )
}
