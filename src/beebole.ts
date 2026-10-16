import axios, { AxiosInstance } from "axios";

export interface BeeboleTimeEntry {
  date: string;
  project_id?: string;
  subproject_id?: string;
  task_id?: string;
  absence_id?: string;
  hours: number;
  comment?: string;
}

const idOf = (ref: any): string | null => (ref?.id != null ? String(ref.id) : null);

export class BeeboleClient {
  private client: AxiosInstance;
  private baseUrl = "https://beebole-apps.com/api/v2";

  constructor(token: string) {
    const auth = Buffer.from(`${token}:x`).toString("base64");
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000, // 15 seconds timeout
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    });
  }

  private async callService<T>(service: string, params: any = {}): Promise<T> {
    let data: any;
    try {
      data = (await this.client.post("", { service, ...params })).data;
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || "Request failed";
      throw new Error(`Beebole API call failed (${service}): ${msg}`);
    }
    if (data?.status !== "ok") {
      const msg = data?.error?.message || data?.message || "Unknown Beebole API error";
      throw new Error(`Beebole API call failed (${service}): ${msg}`);
    }
    return data;
  }

  private normalize(items: any[]): any[] {
    return items.map(item => ({
      ...item,
      id: String(item.id),
      companyId: item.companyId ? String(item.companyId) : (item.company?.id ? String(item.company.id) : undefined),
      projectId: item.projectId ? String(item.projectId) : (item.project?.id ? String(item.project.id) : undefined),
      subprojectId: item.subprojectId ? String(item.subprojectId) : (item.subproject?.id ? String(item.subproject.id) : undefined)
    }));
  }

  async listCompanies(): Promise<any[]> {
    const data = await this.callService<any>("company.list");
    return this.normalize(data.companies || data.results || []).filter(c => c.active !== false);
  }

  async listProjects(companyIds?: string[]): Promise<any[]> {
    let allProjects: any[] = [];
    if (companyIds && companyIds.length > 0) {
      for (const id of companyIds) {
        const data = await this.callService<any>("project.list", { company: { id: Number(id) } });
        allProjects.push(...this.normalize(data.projects || data.results || []));
      }
    }
    return allProjects.filter(p => p.active !== false);
  }

  async listSubprojects(projectIds?: string[]): Promise<any[]> {
    let allSubprojects: any[] = [];
    if (projectIds && projectIds.length > 0) {
      for (const id of projectIds) {
        const data = await this.callService<any>("subproject.list", { project: { id: Number(id) } });
        allSubprojects.push(...this.normalize(data.subprojects || data.results || []));
      }
    }
    return allSubprojects.filter(s => s.active !== false);
  }

  async listTasks(): Promise<any[]> {
    const data = await this.callService<any>("task.list");
    return this.normalize(data.tasks || data.results || []).filter(t => t.active !== false);
  }

  async listAbsenceTypes(companyIds?: string[]): Promise<any[]> {
    let allAbsences: any[] = [];
    if (companyIds && companyIds.length > 0) {
      for (const id of companyIds) {
        const data = await this.callService<any>("absence.list", { company: { id: Number(id) } });
        allAbsences.push(...this.normalize(data.absences || data.results || []));
      }
    }
    return allAbsences.filter(a => a.active !== false);
  }

  async getTimeEntries(startDate: string, endDate: string): Promise<any[]> {
    const data = await this.callService<any>("time_entry.list", { from: startDate, to: endDate });
    return data.timeEntries || data.results || data.time_entries || [];
  }

  /**
   * Sets the total hours of one timesheet row on one date: updates the matching
   * entry if one exists, otherwise creates it. Exactly one of subproject_id,
   * project_id or absence_id must be given.
   */
  async setTimeEntry(entry: BeeboleTimeEntry): Promise<any> {
    const targets = [entry.subproject_id, entry.project_id, entry.absence_id].filter(Boolean);
    if (targets.length !== 1) {
      throw new Error("Provide exactly one of subproject_id, project_id or absence_id");
    }
    const taskId = entry.task_id ? String(entry.task_id) : null;

    const existing = (await this.getTimeEntries(entry.date, entry.date)).filter(e => {
      if (e.date && e.date !== entry.date) return false;
      if (entry.absence_id) return idOf(e.absence) === String(entry.absence_id);
      if (idOf(e.absence) || idOf(e.task) !== taskId) return false;
      if (entry.subproject_id) return idOf(e.subproject) === String(entry.subproject_id);
      return !idOf(e.subproject) && idOf(e.project) === String(entry.project_id);
    });
    if (existing.length > 1) {
      throw new Error(
        `Ambiguous: ${existing.length} entries match this row on ${entry.date} (ids ${existing.map(e => e.id).join(", ")}). Delete the extras first.`
      );
    }

    const payload: any = { date: entry.date, hours: entry.hours };
    if (entry.comment !== undefined) payload.comment = entry.comment;
    if (existing.length === 1) payload.id = existing[0].id;
    if (entry.absence_id) payload.absence = { id: Number(entry.absence_id) };
    else if (entry.subproject_id) payload.subproject = { id: Number(entry.subproject_id) };
    else payload.project = { id: Number(entry.project_id) };
    if (taskId) payload.task = { id: Number(taskId) };

    const data = await this.callService<any>(existing.length === 1 ? "time_entry.update" : "time_entry.create", payload);
    return { ...data, action: existing.length === 1 ? "updated" : "created" };
  }

  async deleteTimeEntry(id: string, date: string): Promise<any> {
    return this.callService<any>("time_entry.delete", { id: Number(id), date });
  }
}
