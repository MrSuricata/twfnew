// Simple localStorage-based store for MVP
export interface Subscriber {
  id: string;
  email: string;
  name?: string;
  joinedAt: string;
  projectId: string;
  referrer?: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  headline: string;
  description: string;
  ctaText: string;
  countdownDate?: string;
  bgStyle: 'gradient-purple' | 'gradient-blue' | 'gradient-dark' | 'gradient-sunset' | 'solid-white' | 'solid-dark';
  accentColor: string;
  logoUrl?: string;
  webhookUrl?: string;
  createdAt: string;
  subscribers: Subscriber[];
}

const STORAGE_KEY = 'launchbase_projects';

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).substring(2, 6);
}

export function getProjects(): Project[] {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

export function getProject(id: string): Project | undefined {
  return getProjects().find(p => p.id === id);
}

export function getProjectBySlug(slug: string): Project | undefined {
  return getProjects().find(p => p.slug === slug);
}

export function saveProject(project: Omit<Project, 'id' | 'slug' | 'createdAt' | 'subscribers'>): Project {
  const projects = getProjects();
  const newProject: Project = {
    ...project,
    id: generateId(),
    slug: generateSlug(project.name),
    createdAt: new Date().toISOString(),
    subscribers: [],
  };
  projects.push(newProject);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  return newProject;
}

export function updateProject(id: string, updates: Partial<Project>): Project | undefined {
  const projects = getProjects();
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) return undefined;
  projects[index] = { ...projects[index], ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  return projects[index];
}

export function deleteProject(id: string): void {
  const projects = getProjects().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export async function addSubscriber(
  projectId: string,
  email: string,
  name?: string,
  referrer?: string
): Promise<{ success: boolean; message: string }> {
  const projects = getProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) return { success: false, message: 'Project not found' };

  if (project.subscribers.some(s => s.email === email)) {
    return { success: false, message: 'Ya estás en la lista!' };
  }

  const subscriber: Subscriber = {
    id: generateId(),
    email,
    name,
    joinedAt: new Date().toISOString(),
    projectId,
    referrer,
  };

  project.subscribers.push(subscriber);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));

  // Fire webhook to n8n if configured
  if (project.webhookUrl) {
    try {
      await fetch(project.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'new_subscriber',
          project: { id: project.id, name: project.name, slug: project.slug },
          subscriber: { email, name, joinedAt: subscriber.joinedAt },
          totalSubscribers: project.subscribers.length,
        }),
      });
    } catch {
      // Webhook failure shouldn't block signup
    }
  }

  return { success: true, message: 'Te has unido a la lista!' };
}

// Analytics helpers
export function getSubscribersByDay(project: Project): { date: string; count: number }[] {
  const counts: Record<string, number> = {};
  project.subscribers.forEach(s => {
    const date = s.joinedAt.split('T')[0];
    counts[date] = (counts[date] || 0) + 1;
  });

  const sorted = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return sorted;
}

export function getSubscribersLast7Days(project: Project): number {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  return project.subscribers.filter(s => new Date(s.joinedAt) >= weekAgo).length;
}
