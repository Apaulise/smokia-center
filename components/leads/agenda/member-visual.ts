import type { TeamMember } from "@/lib/leads/team/queries";

const MEMBER_COLORS = ["#f2c14e", "#66c7d5", "#a78bfa", "#8fb39a", "#f08a8a", "#e69f66", "#7aa2f7", "#d386c6"];

export function appointmentMember(ownerId: string, members: TeamMember[]): TeamMember | undefined {
  return members.find((member) => member.ownerId === ownerId);
}

export function memberColor(ownerId: string, members: TeamMember[]): string {
  const index = Math.max(0, members.findIndex((member) => member.ownerId === ownerId));
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}
