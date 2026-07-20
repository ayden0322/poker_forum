// 隊伍顯示映射（design-mentor P1-E）：key = API-Sports 英文隊名。
// ⚠️ 開新板塊（EPL/NPB…）要補映射，否則 fallback 成兩字母縮寫圓徽（刻意的優雅降級，不是 bug）。
// 世界盃資料源：world_cup_teams 表（name_zh/flag_emoji）；MLB logo 走站上既有 mlbstatic 慣例。

export interface TeamMeta {
  nameZh: string;
  /** 國旗 emoji（國家隊；此處是資料不是裝飾，與世界盃 widget 同慣例） */
  flag?: string;
  /** MLB 隊徽 id：https://www.mlbstatic.com/team-logos/{id}.svg */
  mlbId?: number;
}

const TEAM_META: Record<string, TeamMeta> = {
  'Algeria': { nameZh: '阿爾及利亞', flag: '🇩🇿' },
  'Argentina': { nameZh: '阿根廷', flag: '🇦🇷' },
  'Australia': { nameZh: '澳洲', flag: '🇦🇺' },
  'Austria': { nameZh: '奧地利', flag: '🇦🇹' },
  'Belgium': { nameZh: '比利時', flag: '🇧🇪' },
  'Bosnia & Herzegovina': { nameZh: '波士尼亞與赫塞哥維納', flag: '🇧🇦' },
  'Brazil': { nameZh: '巴西', flag: '🇧🇷' },
  'Canada': { nameZh: '加拿大', flag: '🇨🇦' },
  'Cape Verde': { nameZh: '維德角', flag: '🇨🇻' },
  'Colombia': { nameZh: '哥倫比亞', flag: '🇨🇴' },
  'Croatia': { nameZh: '克羅埃西亞', flag: '🇭🇷' },
  'Curaçao': { nameZh: '庫拉索', flag: '🇨🇼' },
  'Czech Republic': { nameZh: '捷克', flag: '🇨🇿' },
  'DR Congo': { nameZh: '剛果民主共和國', flag: '🇨🇩' },
  'Ecuador': { nameZh: '厄瓜多', flag: '🇪🇨' },
  'Egypt': { nameZh: '埃及', flag: '🇪🇬' },
  'England': { nameZh: '英格蘭', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  'France': { nameZh: '法國', flag: '🇫🇷' },
  'Germany': { nameZh: '德國', flag: '🇩🇪' },
  'Ghana': { nameZh: '迦納', flag: '🇬🇭' },
  'Haiti': { nameZh: '海地', flag: '🇭🇹' },
  'Iran': { nameZh: '伊朗', flag: '🇮🇷' },
  'Iraq': { nameZh: '伊拉克', flag: '🇮🇶' },
  'Ivory Coast': { nameZh: '象牙海岸', flag: '🇨🇮' },
  'Japan': { nameZh: '日本', flag: '🇯🇵' },
  'Jordan': { nameZh: '約旦', flag: '🇯🇴' },
  'Mexico': { nameZh: '墨西哥', flag: '🇲🇽' },
  'Morocco': { nameZh: '摩洛哥', flag: '🇲🇦' },
  'Netherlands': { nameZh: '荷蘭', flag: '🇳🇱' },
  'New Zealand': { nameZh: '紐西蘭', flag: '🇳🇿' },
  'Norway': { nameZh: '挪威', flag: '🇳🇴' },
  'Panama': { nameZh: '巴拿馬', flag: '🇵🇦' },
  'Paraguay': { nameZh: '巴拉圭', flag: '🇵🇾' },
  'Portugal': { nameZh: '葡萄牙', flag: '🇵🇹' },
  'Qatar': { nameZh: '卡達', flag: '🇶🇦' },
  'Saudi Arabia': { nameZh: '沙烏地阿拉伯', flag: '🇸🇦' },
  'Scotland': { nameZh: '蘇格蘭', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  'Senegal': { nameZh: '塞內加爾', flag: '🇸🇳' },
  'South Africa': { nameZh: '南非', flag: '🇿🇦' },
  'South Korea': { nameZh: '南韓', flag: '🇰🇷' },
  'Spain': { nameZh: '西班牙', flag: '🇪🇸' },
  'Sweden': { nameZh: '瑞典', flag: '🇸🇪' },
  'Switzerland': { nameZh: '瑞士', flag: '🇨🇭' },
  'Tunisia': { nameZh: '突尼西亞', flag: '🇹🇳' },
  'Turkey': { nameZh: '土耳其', flag: '🇹🇷' },
  'USA': { nameZh: '美國', flag: '🇺🇸' },
  'Uruguay': { nameZh: '烏拉圭', flag: '🇺🇾' },
  'Uzbekistan': { nameZh: '烏茲別克', flag: '🇺🇿' },
  'Arizona Diamondbacks': { nameZh: '響尾蛇', mlbId: 109 },
  'Atlanta Braves': { nameZh: '勇士', mlbId: 144 },
  'Baltimore Orioles': { nameZh: '金鶯', mlbId: 110 },
  'Boston Red Sox': { nameZh: '紅襪', mlbId: 111 },
  'Chicago Cubs': { nameZh: '小熊', mlbId: 112 },
  'Chicago White Sox': { nameZh: '白襪', mlbId: 145 },
  'Cincinnati Reds': { nameZh: '紅人', mlbId: 113 },
  'Cleveland Guardians': { nameZh: '守護者', mlbId: 114 },
  'Colorado Rockies': { nameZh: '洛磯', mlbId: 115 },
  'Detroit Tigers': { nameZh: '老虎', mlbId: 116 },
  'Houston Astros': { nameZh: '太空人', mlbId: 117 },
  'Kansas City Royals': { nameZh: '皇家', mlbId: 118 },
  'Los Angeles Angels': { nameZh: '天使', mlbId: 108 },
  'Los Angeles Dodgers': { nameZh: '道奇', mlbId: 119 },
  'Miami Marlins': { nameZh: '馬林魚', mlbId: 146 },
  'Milwaukee Brewers': { nameZh: '釀酒人', mlbId: 158 },
  'Minnesota Twins': { nameZh: '雙城', mlbId: 142 },
  'New York Mets': { nameZh: '大都會', mlbId: 121 },
  'New York Yankees': { nameZh: '洋基', mlbId: 147 },
  'Oakland Athletics': { nameZh: '運動家', mlbId: 133 },
  'Philadelphia Phillies': { nameZh: '費城人', mlbId: 143 },
  'Pittsburgh Pirates': { nameZh: '海盜', mlbId: 134 },
  'San Diego Padres': { nameZh: '教士', mlbId: 135 },
  'San Francisco Giants': { nameZh: '巨人', mlbId: 137 },
  'Seattle Mariners': { nameZh: '水手', mlbId: 136 },
  'St. Louis Cardinals': { nameZh: '紅雀', mlbId: 138 },
  'St.Louis Cardinals': { nameZh: '紅雀', mlbId: 138 },
  'Tampa Bay Rays': { nameZh: '光芒', mlbId: 139 },
  'Texas Rangers': { nameZh: '遊騎兵', mlbId: 140 },
  'Toronto Blue Jays': { nameZh: '藍鳥', mlbId: 141 },
  'Washington Nationals': { nameZh: '國民', mlbId: 120 },
  'Athletics': { nameZh: '運動家', mlbId: 133 },
};

export function teamMeta(nameEn: string): TeamMeta | null {
  return TEAM_META[nameEn] ?? null;
}

/** fallback 縮寫（查不到映射時的圓徽字） */
export function teamAbbr(nameEn: string): string {
  const words = nameEn.split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : nameEn.slice(0, 2)).toUpperCase();
}
