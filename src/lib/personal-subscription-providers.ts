import type { LucideIcon } from 'lucide-react';
import {
  CreditCard,
  Smartphone,
  Dumbbell,
  Wifi,
  Shield,
  FileText,
  FolderKanban,
} from 'lucide-react';

export type PersonalSubscriptionProviderCategory =
  | 'ai'
  | 'entertainment'
  | 'cloud'
  | 'shopping'
  | 'gaming'
  | 'security'
  | 'telecom'
  | 'education'
  | 'fitness'
  | 'generic';

export interface PersonalSubscriptionProvider {
  key: string;
  name: string;
  aliases: string[];
  provider: string;
  category: PersonalSubscriptionProviderCategory;
  websiteDomain?: string;
  logo:
    | { kind: 'brand'; brandKey: string; baseColor: string }
    | { kind: 'icon'; icon: LucideIcon; baseColor: string; foregroundColor: string };
}

export const PERSONAL_SUBSCRIPTION_PROVIDERS: PersonalSubscriptionProvider[] = [
  {
    key: 'chatgpt',
    name: 'ChatGPT',
    aliases: ['openai', 'gpt', 'gpt 4', 'gpt4', 'chat gpt', 'o1', 'open ai'],
    provider: 'OpenAI',
    category: 'ai',
    websiteDomain: 'chat.openai.com',
    logo: { kind: 'brand', brandKey: 'chatgpt', baseColor: '#10A37F' },
  },
  {
    key: 'claude',
    name: 'Claude',
    aliases: ['anthropic', 'claude ai', 'sonnet', 'opus', 'haiku'],
    provider: 'Anthropic',
    category: 'ai',
    websiteDomain: 'claude.ai',
    logo: { kind: 'brand', brandKey: 'claude', baseColor: '#D0742B' },
  },
  {
    key: 'gemini',
    name: 'Google Gemini',
    aliases: ['google ai', 'bard', 'gemini advanced', 'gemini ultra'],
    provider: 'Google',
    category: 'ai',
    websiteDomain: 'gemini.google.com',
    logo: { kind: 'brand', brandKey: 'gemini', baseColor: '#8AB4F8' },
  },
  {
    key: 'copilot',
    name: 'Microsoft Copilot',
    aliases: ['ms copilot', 'bing copilot', 'windows copilot', 'm365 copilot'],
    provider: 'Microsoft',
    category: 'ai',
    websiteDomain: 'copilot.microsoft.com',
    logo: { kind: 'brand', brandKey: 'microsoft', baseColor: '#00A4EF' },
  },
  {
    key: 'perplexity',
    name: 'Perplexity',
    aliases: ['pplx', 'perplexity ai'],
    provider: 'Perplexity AI',
    category: 'ai',
    websiteDomain: 'perplexity.ai',
    logo: { kind: 'brand', brandKey: 'perplexity', baseColor: '#18181B' },
  },
  {
    key: 'midjourney',
    name: 'Midjourney',
    aliases: ['mid journey', 'mj'],
    provider: 'Midjourney, Inc.',
    category: 'ai',
    websiteDomain: 'midjourney.com',
    logo: { kind: 'brand', brandKey: 'midjourney', baseColor: '#111012' },
  },
  {
    key: 'grok',
    name: 'Grok',
    aliases: ['grok ai', 'x ai', 'xai'],
    provider: 'xAI',
    category: 'ai',
    websiteDomain: 'grok.x.ai',
    logo: { kind: 'brand', brandKey: 'grok', baseColor: '#111827' },
  },
  {
    key: 'canva',
    name: 'Canva Pro',
    aliases: ['canva'],
    provider: 'Canva',
    category: 'ai',
    websiteDomain: 'canva.com',
    logo: { kind: 'brand', brandKey: 'canva', baseColor: '#00C4CC' },
  },
  {
    key: 'grammarly',
    name: 'Grammarly',
    aliases: ['grammarly premium', 'gramarly'],
    provider: 'Grammarly, Inc.',
    category: 'ai',
    websiteDomain: 'grammarly.com',
    logo: { kind: 'brand', brandKey: 'grammarly', baseColor: '#03B57C' },
  },
  {
    key: 'notion',
    name: 'Notion',
    aliases: ['notion ai', 'notion pro', 'notion plus'],
    provider: 'Notion Labs',
    category: 'ai',
    websiteDomain: 'notion.so',
    logo: { kind: 'brand', brandKey: 'notion', baseColor: '#111111' },
  },
  {
    key: 'trae',
    name: 'Trae',
    aliases: ['trae.ai', 'trae pro plan', 'trae – pro plan', 'trae - pro plan'],
    provider: 'Trae AI',
    category: 'ai',
    websiteDomain: 'trae.ai',
    logo: { kind: 'brand', brandKey: 'trae', baseColor: '#0F766E' },
  },
  {
    key: 'github_copilot',
    name: 'GitHub Copilot',
    aliases: ['copilot individual', 'copilot business', 'gh copilot', 'github ai'],
    provider: 'GitHub',
    category: 'ai',
    websiteDomain: 'github.com/features/copilot',
    logo: { kind: 'brand', brandKey: 'github', baseColor: '#0D1117' },
  },

  {
    key: 'netflix',
    name: 'Netflix',
    aliases: ['netflixx'],
    provider: 'Netflix, Inc.',
    category: 'entertainment',
    websiteDomain: 'netflix.com',
    logo: { kind: 'brand', brandKey: 'netflix', baseColor: '#E50914' },
  },
  {
    key: 'amazon_prime',
    name: 'Amazon Prime',
    aliases: ['prime', 'amazon prime video', 'amazonprime', 'amazon video'],
    provider: 'Amazon',
    category: 'entertainment',
    websiteDomain: 'primevideo.com',
    logo: { kind: 'brand', brandKey: 'amazon_prime', baseColor: '#00A8E1' },
  },
  {
    key: 'disney_plus',
    name: 'Disney+',
    aliases: ['disney plus', 'disney +', 'disneyplus'],
    provider: 'The Walt Disney Company',
    category: 'entertainment',
    websiteDomain: 'disneyplus.com',
    logo: { kind: 'brand', brandKey: 'disney_plus', baseColor: '#113CCF' },
  },
  {
    key: 'youtube_premium',
    name: 'YouTube Premium',
    aliases: ['yt premium', 'youtube music', 'youtube red'],
    provider: 'Google',
    category: 'entertainment',
    websiteDomain: 'youtube.com/premium',
    logo: { kind: 'brand', brandKey: 'youtube', baseColor: '#FF0000' },
  },
  {
    key: 'spotify',
    name: 'Spotify',
    aliases: ['spotify premium', 'spotify family', 'spotify duo'],
    provider: 'Spotify AB',
    category: 'entertainment',
    websiteDomain: 'spotify.com',
    logo: { kind: 'brand', brandKey: 'spotify', baseColor: '#1DB954' },
  },
  {
    key: 'apple_music',
    name: 'Apple Music',
    aliases: ['music appletv', 'itunes match', 'appleone music'],
    provider: 'Apple',
    category: 'entertainment',
    websiteDomain: 'music.apple.com',
    logo: { kind: 'brand', brandKey: 'apple', baseColor: '#FB233B' },
  },
  {
    key: 'apple_tv',
    name: 'Apple TV+',
    aliases: ['apple tv plus', 'appletv+', 'apple tv +'],
    provider: 'Apple',
    category: 'entertainment',
    websiteDomain: 'tv.apple.com',
    logo: { kind: 'brand', brandKey: 'apple', baseColor: '#000000' },
  },
  {
    key: 'shahid',
    name: 'Shahid',
    aliases: ['shahid vip', 'shahid premium', 'mbc shahid'],
    provider: 'MBC Group',
    category: 'entertainment',
    websiteDomain: 'shahid.mbc.net',
    logo: { kind: 'brand', brandKey: 'shahid', baseColor: '#DD0066' },
  },
  {
    key: 'osn_plus',
    name: 'OSN+',
    aliases: ['osn plus', 'osn streaming', 'osn +'],
    provider: 'OSN',
    category: 'entertainment',
    websiteDomain: 'osnplusstream.com',
    logo: { kind: 'brand', brandKey: 'osn_plus', baseColor: '#111827' },
  },
  {
    key: 'starzplay',
    name: 'StarzPlay',
    aliases: ['starz play', 'lionsgate+', 'starz'],
    provider: 'Lionsgate+',
    category: 'entertainment',
    websiteDomain: 'starzplay.com',
    logo: { kind: 'brand', brandKey: 'starzplay', baseColor: '#000000' },
  },
  {
    key: 'audible',
    name: 'Audible',
    aliases: ['audible premium', 'audible plus'],
    provider: 'Amazon',
    category: 'entertainment',
    websiteDomain: 'audible.com',
    logo: { kind: 'brand', brandKey: 'audible', baseColor: '#000000' },
  },

  {
    key: 'google_one',
    name: 'Google One',
    aliases: ['google storage', 'google drive storage'],
    provider: 'Google',
    category: 'cloud',
    websiteDomain: 'one.google.com',
    logo: { kind: 'brand', brandKey: 'google', baseColor: '#4285F4' },
  },
  {
    key: 'google_workspace',
    name: 'Google Workspace',
    aliases: ['gsuite', 'g suite', 'workspace', 'google apps'],
    provider: 'Google',
    category: 'cloud',
    websiteDomain: 'workspace.google.com',
    logo: { kind: 'brand', brandKey: 'google', baseColor: '#1A73E8' },
  },
  {
    key: 'microsoft_365',
    name: 'Microsoft 365',
    aliases: ['office 365', 'm365', 'ms office', 'office home'],
    provider: 'Microsoft',
    category: 'cloud',
    websiteDomain: 'microsoft.com/microsoft-365',
    logo: { kind: 'brand', brandKey: 'microsoft', baseColor: '#D83B01' },
  },
  {
    key: 'onedrive',
    name: 'OneDrive',
    aliases: ['ms onedrive', 'one drive'],
    provider: 'Microsoft',
    category: 'cloud',
    websiteDomain: 'onedrive.live.com',
    logo: { kind: 'brand', brandKey: 'onedrive', baseColor: '#0078D4' },
  },
  {
    key: 'dropbox',
    name: 'Dropbox',
    aliases: ['drop box', 'dropbox pro'],
    provider: 'Dropbox, Inc.',
    category: 'cloud',
    websiteDomain: 'dropbox.com',
    logo: { kind: 'brand', brandKey: 'dropbox', baseColor: '#0061FF' },
  },
  {
    key: 'icloud',
    name: 'iCloud+',
    aliases: ['icloud plus', 'icloud +', 'apple icloud'],
    provider: 'Apple',
    category: 'cloud',
    websiteDomain: 'icloud.com',
    logo: { kind: 'brand', brandKey: 'icloud', baseColor: '#3880FF' },
  },
  {
    key: 'adobe_cc',
    name: 'Adobe Creative Cloud',
    aliases: ['adobe creative suite', 'photoshop plan', 'adobe all apps', 'creative cloud'],
    provider: 'Adobe',
    category: 'cloud',
    websiteDomain: 'adobe.com/creativecloud',
    logo: { kind: 'brand', brandKey: 'adobe', baseColor: '#DA1F26' },
  },
  {
    key: 'zoom',
    name: 'Zoom',
    aliases: ['zoom one', 'zoom meetings', 'zoom pro'],
    provider: 'Zoom Video Communications',
    category: 'cloud',
    websiteDomain: 'zoom.us',
    logo: { kind: 'brand', brandKey: 'zoom', baseColor: '#0B5CFF' },
  },
  {
    key: 'slack',
    name: 'Slack',
    aliases: ['slack pro', 'slack plus'],
    provider: 'Salesforce',
    category: 'cloud',
    websiteDomain: 'slack.com',
    logo: { kind: 'brand', brandKey: 'slack', baseColor: '#4A154B' },
  },
  {
    key: 'github',
    name: 'GitHub',
    aliases: ['github pro', 'github team', 'gh pro'],
    provider: 'GitHub, Inc.',
    category: 'cloud',
    websiteDomain: 'github.com',
    logo: { kind: 'brand', brandKey: 'github', baseColor: '#181717' },
  },
  {
    key: 'figma',
    name: 'Figma',
    aliases: ['figma professional', 'figma organization'],
    provider: 'Figma, Inc.',
    category: 'cloud',
    websiteDomain: 'figma.com',
    logo: { kind: 'brand', brandKey: 'figma', baseColor: '#A259FF' },
  },

  {
    key: 'noon_one',
    name: 'Noon One',
    aliases: ['noon one plus', 'noonprime', 'noon'],
    provider: 'Noon',
    category: 'shopping',
    websiteDomain: 'noon.com',
    logo: { kind: 'brand', brandKey: 'noon', baseColor: '#000000' },
  },
  {
    key: 'careem_plus',
    name: 'Careem Plus',
    aliases: ['careem', 'careem pay', 'careem rewards'],
    provider: 'Careem',
    category: 'shopping',
    websiteDomain: 'careem.com',
    logo: { kind: 'brand', brandKey: 'careem', baseColor: '#00C2A5' },
  },
  {
    key: 'talabat_pro',
    name: 'Talabat Pro',
    aliases: ['talabat', 'talabat plus', 'talabat mart'],
    provider: 'Talabat',
    category: 'shopping',
    websiteDomain: 'talabat.com',
    logo: { kind: 'brand', brandKey: 'talabat', baseColor: '#FF6200' },
  },
  {
    key: 'deliveroo_plus',
    name: 'Deliveroo Plus',
    aliases: ['deliveroo', 'roo plus'],
    provider: 'Deliveroo',
    category: 'shopping',
    websiteDomain: 'deliveroo.co.uk',
    logo: { kind: 'brand', brandKey: 'deliveroo', baseColor: '#00CCBC' },
  },

  {
    key: 'xbox_game_pass',
    name: 'Xbox Game Pass',
    aliases: ['game pass ultimate', 'xbox game pass pc', 'gamepass'],
    provider: 'Microsoft',
    category: 'gaming',
    websiteDomain: 'xbox.com/game-pass',
    logo: { kind: 'brand', brandKey: 'xbox', baseColor: '#107C10' },
  },
  {
    key: 'playstation_plus',
    name: 'PlayStation Plus',
    aliases: ['ps plus', 'ps plus extra', 'ps plus premium'],
    provider: 'Sony Interactive Entertainment',
    category: 'gaming',
    websiteDomain: 'playstation.com/plus',
    logo: { kind: 'brand', brandKey: 'playstation', baseColor: '#003087' },
  },
  {
    key: 'nintendo_online',
    name: 'Nintendo Switch Online',
    aliases: ['nintendo online', 'switch online', 'nso'],
    provider: 'Nintendo',
    category: 'gaming',
    websiteDomain: 'nintendo.com/switch-online',
    logo: { kind: 'brand', brandKey: 'nintendo', baseColor: '#E60012' },
  },
  {
    key: 'ea_play',
    name: 'EA Play',
    aliases: ['ea play pro', 'ea access'],
    provider: 'Electronic Arts',
    category: 'gaming',
    websiteDomain: 'ea.com/ea-play',
    logo: { kind: 'brand', brandKey: 'ea', baseColor: '#000000' },
  },

  {
    key: 'windows',
    name: 'Microsoft Windows',
    aliases: ['windows 11', 'windows license', 'microsoft windows'],
    provider: 'Microsoft',
    category: 'security',
    websiteDomain: 'microsoft.com/windows',
    logo: { kind: 'brand', brandKey: 'windows', baseColor: '#0078D4' },
  },
  {
    key: 'nordvpn',
    name: 'NordVPN',
    aliases: ['nord vpn', 'nord'],
    provider: 'Nord Security',
    category: 'security',
    websiteDomain: 'nordvpn.com',
    logo: { kind: 'brand', brandKey: 'nordvpn', baseColor: '#4687FF' },
  },
  {
    key: 'expressvpn',
    name: 'ExpressVPN',
    aliases: ['express vpn'],
    provider: 'Express VPN International',
    category: 'security',
    websiteDomain: 'expressvpn.com',
    logo: { kind: 'brand', brandKey: 'expressvpn', baseColor: '#DA1F26' },
  },
  {
    key: 'mcafee',
    name: 'McAfee',
    aliases: ['mcafee total protection', 'mcafee antivirus'],
    provider: 'McAfee LLC',
    category: 'security',
    websiteDomain: 'mcafee.com',
    logo: { kind: 'brand', brandKey: 'mcafee', baseColor: '#C01316' },
  },
  {
    key: 'norton',
    name: 'Norton',
    aliases: ['norton 360', 'norton lifelock', 'norton antivirus'],
    provider: 'Gen Digital',
    category: 'security',
    websiteDomain: 'us.norton.com',
    logo: { kind: 'brand', brandKey: 'norton', baseColor: '#FFC420' },
  },
  {
    key: 'bitdefender',
    name: 'Bitdefender',
    aliases: ['bit defender', 'bitdefender total security'],
    provider: 'Bitdefender',
    category: 'security',
    websiteDomain: 'bitdefender.com',
    logo: { kind: 'brand', brandKey: 'bitdefender', baseColor: '#ED1C24' },
  },

  {
    key: 'linkedin_premium',
    name: 'LinkedIn Premium',
    aliases: ['linkedin', 'linkedin premium career', 'linkedin recruiter'],
    provider: 'LinkedIn',
    category: 'telecom',
    websiteDomain: 'linkedin.com',
    logo: { kind: 'brand', brandKey: 'linkedin', baseColor: '#0A66C2' },
  },
  {
    key: 'coursera_plus',
    name: 'Coursera Plus',
    aliases: ['coursera', 'coursera subscription'],
    provider: 'Coursera',
    category: 'education',
    websiteDomain: 'coursera.org',
    logo: { kind: 'brand', brandKey: 'coursera', baseColor: '#0056D2' },
  },
  {
    key: 'duolingo_super',
    name: 'Duolingo Super',
    aliases: ['duolingo plus', 'duolingo', 'super duolingo'],
    provider: 'Duolingo',
    category: 'education',
    websiteDomain: 'duolingo.com',
    logo: { kind: 'brand', brandKey: 'duolingo', baseColor: '#58CC02' },
  },
  {
    key: 'strava',
    name: 'Strava',
    aliases: ['strava summit', 'strava subscription'],
    provider: 'Strava, Inc.',
    category: 'fitness',
    websiteDomain: 'strava.com',
    logo: { kind: 'brand', brandKey: 'strava', baseColor: '#FC4C02' },
  },
  {
    key: 'whoop',
    name: 'WHOOP',
    aliases: ['whoop membership'],
    provider: 'WHOOP, Inc.',
    category: 'fitness',
    websiteDomain: 'whoop.com',
    logo: { kind: 'brand', brandKey: 'whoop', baseColor: '#00D2A4' },
  },

  {
    key: 'gym',
    name: 'Gym / Fitness Membership',
    aliases: ['gym membership', 'fitness', 'health club', 'fitness first', 'gold gym', 'anytime fitness'],
    provider: 'Fitness',
    category: 'generic',
    logo: { kind: 'icon', icon: Dumbbell, baseColor: '#0F172A', foregroundColor: '#F8FAFC' },
  },
  {
    key: 'mobile_plan',
    name: 'Mobile Plan',
    aliases: ['phone bill', 'mobile postpaid', 'cellular', 'sim plan', 'phone plan'],
    provider: 'Telecom',
    category: 'generic',
    logo: { kind: 'icon', icon: Smartphone, baseColor: '#111827', foregroundColor: '#E5E7EB' },
  },
  {
    key: 'internet',
    name: 'Internet / Broadband',
    aliases: ['wifi bill', 'broadband', 'fiber', 'isp'],
    provider: 'Telecom',
    category: 'generic',
    logo: { kind: 'icon', icon: Wifi, baseColor: '#0F766E', foregroundColor: '#CCFBF1' },
  },
  {
    key: 'insurance',
    name: 'Insurance',
    aliases: ['health insurance', 'car insurance', 'auto insurance', 'home insurance', 'life insurance'],
    provider: 'Insurance',
    category: 'generic',
    logo: { kind: 'icon', icon: Shield, baseColor: '#1E3A8A', foregroundColor: '#DBEAFE' },
  },
  {
    key: 'school',
    name: 'School / Tuition',
    aliases: ['tuition', 'school fees', 'university', 'college'],
    provider: 'Education',
    category: 'generic',
    logo: { kind: 'icon', icon: FileText, baseColor: '#7C2D12', foregroundColor: '#FED7AA' },
  },
  {
    key: 'storage',
    name: 'Storage Unit',
    aliases: ['self storage', 'storage unit', 'storage space'],
    provider: 'Storage',
    category: 'generic',
    logo: { kind: 'icon', icon: FolderKanban, baseColor: '#581C87', foregroundColor: '#E9D5FF' },
  },
  {
    key: 'other',
    name: 'Other Subscription',
    aliases: ['misc', 'miscellaneous', 'custom subscription'],
    provider: 'Other',
    category: 'generic',
    logo: { kind: 'icon', icon: CreditCard, baseColor: '#475569', foregroundColor: '#F1F5F9' },
  },
];

export function getPersonalSubscriptionProviderByKey(key: string | null | undefined) {
  if (!key) return null;
  const trimmed = key.trim().toLowerCase();
  return PERSONAL_SUBSCRIPTION_PROVIDERS.find((provider) => provider.key.toLowerCase() === trimmed) || null;
}

export function normalizePersonalSubscriptionMatchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function matchTokens(haystackTokens: string[], needleTokens: string[]) {
  return needleTokens.every((needleToken) =>
    haystackTokens.some((haystackToken) => haystackToken.includes(needleToken))
  );
}

export function findPersonalSubscriptionProvider(name: string | null | undefined): PersonalSubscriptionProvider | null {
  if (!name) return null;
  const normalized = normalizePersonalSubscriptionMatchText(name);
  if (!normalized) return null;
  const tokens = normalized.split(/\s+/).filter(Boolean);

  const directMatch = PERSONAL_SUBSCRIPTION_PROVIDERS.find((provider) => {
    const haystacks = [provider.name, provider.provider, ...provider.aliases].map((value) =>
      normalizePersonalSubscriptionMatchText(value)
    );
    return haystacks.some((haystack) => haystack === normalized);
  });
  if (directMatch) return directMatch;

  const partialMatch = PERSONAL_SUBSCRIPTION_PROVIDERS.find((provider) => {
    const haystackTokens = [provider.name, provider.provider, ...provider.aliases]
      .flatMap((value) => normalizePersonalSubscriptionMatchText(value).split(/\s+/).filter(Boolean));
    return matchTokens(haystackTokens, tokens);
  });
  if (partialMatch) return partialMatch;

  const reverseMatch = PERSONAL_SUBSCRIPTION_PROVIDERS.find((provider) => {
    const haystacks = [provider.name, provider.provider, ...provider.aliases].map((value) =>
      normalizePersonalSubscriptionMatchText(value)
    );
    return haystacks.some((haystack) => !haystack && (normalized.includes(haystack) || haystack.includes(normalized)));
  });
  if (reverseMatch) return reverseMatch;

  return null;
}

export function searchPersonalSubscriptionProviders(
  query: string,
  limit = 8
): PersonalSubscriptionProvider[] {
  const trimmed = query.trim();
  if (!trimmed) return PERSONAL_SUBSCRIPTION_PROVIDERS.slice(0, limit);
  const normalized = normalizePersonalSubscriptionMatchText(trimmed);
  if (!normalized) return PERSONAL_SUBSCRIPTION_PROVIDERS.slice(0, limit);
  const tokens = normalized.split(/\s+/).filter(Boolean);

  const scored = PERSONAL_SUBSCRIPTION_PROVIDERS.map((provider) => {
    let score = 0;
    const nameN = normalizePersonalSubscriptionMatchText(provider.name);
    const providerN = normalizePersonalSubscriptionMatchText(provider.provider);
    const aliasesN = provider.aliases.map((alias) => normalizePersonalSubscriptionMatchText(alias));
    const all = [nameN, providerN, ...aliasesN].filter(Boolean);
    const allTokens = all.flatMap((value) => value.split(/\s+/).filter(Boolean));

    if (all.some((value) => value === normalized)) score += 1000;
    if (nameN === normalized) score += 500;
    if (all.some((value) => value.startsWith(normalized))) score += 300;
    if (nameN.startsWith(normalized)) score += 250;
    if (all.some((value) => value.includes(normalized))) score += 120;
    if (nameN.includes(normalized)) score += 100;
    if (matchTokens(allTokens, tokens)) score += 80;
    return { provider, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.provider);
}
