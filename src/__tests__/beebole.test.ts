import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { BeeboleClient } from '../beebole.js';

vi.mock('axios');

describe('BeeboleClient', () => {
  let client: BeeboleClient;
  const mockedAxios = axios as any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedAxios.create = vi.fn(() => mockedAxios);
    client = new BeeboleClient('fake-token');
    
    // Default mock implementation for post
    mockedAxios.post.mockImplementation(async (url: string, payload: any) => {
      if (payload.service === 'company.list') {
        return { data: { status: 'ok', companies: [{ id: 1, name: 'Company A', active: true }] } };
      }
      if (payload.service === 'project.list') {
        return { data: { status: 'ok', projects: [{ id: 101, name: 'Project X', companyId: 1, active: true }] } };
      }
      if (payload.service === 'time_entry.list') {
        return { data: { status: 'ok', results: [] } };
      }
      if (payload.service === 'time_entry.create') {
        return { data: { status: 'ok', timeEntry: { id: 999, status: 'd' } } };
      }
      if (payload.service === 'time_entry.update') {
        return { data: { status: 'ok', timeEntry: { id: 999, status: 's' } } };
      }
      return { data: { status: 'ok' } };
    });
  });

  it('should list companies and filter active ones', async () => {
    const companies = await client.listCompanies();
    expect(companies).toHaveLength(1);
    expect(companies[0].name).toBe('Company A');
  });

  it('creates a subproject entry when none exists', async () => {
    const result = await client.setTimeEntry({ date: '2026-04-07', subproject_id: '201', hours: 8, comment: 'Testing' });

    expect(result.action).toBe('created');
    expect(mockedAxios.post).toHaveBeenCalledWith('', expect.objectContaining({
      service: 'time_entry.create', subproject: { id: 201 }, hours: 8,
    }));
  });

  it('updates the entry for the same row instead of adding', async () => {
    mockedAxios.post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.service === 'time_entry.list') {
        return { data: { status: 'ok', results: [
          { id: 998, date: '2026-04-07', subproject: { id: 202 } },
          { id: 999, date: '2026-04-07', subproject: { id: 201 } },
        ] } };
      }
      return { data: { status: 'ok', time_entry: { id: 999, status: 'd' } } };
    });

    const result = await client.setTimeEntry({ date: '2026-04-07', subproject_id: '201', hours: 4 });

    expect(result.action).toBe('updated');
    expect(mockedAxios.post).toHaveBeenCalledWith('', expect.objectContaining({ service: 'time_entry.update', id: 999, hours: 4 }));
  });

  it('does not match an entry on the same subproject with a different task', async () => {
    mockedAxios.post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.service === 'time_entry.list') {
        return { data: { status: 'ok', results: [{ id: 999, date: '2026-04-07', subproject: { id: 201 }, task: { id: 5 } }] } };
      }
      return { data: { status: 'ok' } };
    });

    const result = await client.setTimeEntry({ date: '2026-04-07', subproject_id: '201', hours: 2 });

    expect(result.action).toBe('created');
  });

  it('refuses ambiguous matches', async () => {
    mockedAxios.post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.service === 'time_entry.list') {
        return { data: { status: 'ok', results: [
          { id: 1, date: '2026-04-07', subproject: { id: 201 } },
          { id: 2, date: '2026-04-07', subproject: { id: 201 } },
        ] } };
      }
      return { data: { status: 'ok' } };
    });

    await expect(client.setTimeEntry({ date: '2026-04-07', subproject_id: '201', hours: 2 })).rejects.toThrow('Ambiguous');
    expect(mockedAxios.post).not.toHaveBeenCalledWith('', expect.objectContaining({ service: 'time_entry.create' }));
  });

  it('requires exactly one target', async () => {
    await expect(client.setTimeEntry({ date: '2026-04-07', subproject_id: '1', absence_id: '2', hours: 1 })).rejects.toThrow('exactly one');
  });

  it('propagates list errors instead of returning empty results', async () => {
    mockedAxios.post.mockImplementation(async (_url: string, payload: any) => {
      if (payload.service === 'project.list') return { data: { status: 'error', message: 'Forbidden' } };
      return { data: { status: 'ok' } };
    });

    await expect(client.listProjects(['1'])).rejects.toThrow('Forbidden');
  });

  it('should handle API errors', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { status: 'error', message: 'Unauthorized' }
    });

    await expect(client.listCompanies()).rejects.toThrow('Unauthorized');
  });
});
