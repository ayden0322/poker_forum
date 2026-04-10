export interface GifCategory {
  id: string;
  label: string;
  searchTerm: string;
  icon: string;
}

export const GIF_CATEGORIES: GifCategory[] = [
  { id: 'trending', label: '熱門', searchTerm: '', icon: '🔥' },
  { id: 'funny', label: '搞笑', searchTerm: 'funny', icon: '😂' },
  { id: 'reaction', label: '反應', searchTerm: 'reaction', icon: '😮' },
  { id: 'celebrate', label: '慶祝', searchTerm: 'celebrate', icon: '🎉' },
  { id: 'thumbsup', label: '讚', searchTerm: 'thumbs up', icon: '👍' },
  { id: 'sad', label: '難過', searchTerm: 'sad', icon: '😢' },
  { id: 'angry', label: '生氣', searchTerm: 'angry', icon: '😡' },
  { id: 'love', label: '愛心', searchTerm: 'love', icon: '❤️' },
  { id: 'facepalm', label: '無言', searchTerm: 'facepalm', icon: '🤦' },
  { id: 'dance', label: '跳舞', searchTerm: 'dance', icon: '💃' },
];
