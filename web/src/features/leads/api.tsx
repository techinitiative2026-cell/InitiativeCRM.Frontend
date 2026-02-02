import { api } from "@/services/httpClient";
import type { Lead } from "./types";
import { mockLeads } from "./mockLeads";

export const getLeads = async (): Promise<Lead[]> => {
  const response = await api.get("/leads");
  
  return response.data;
};

export const getMockLeads = async (): Promise<Lead[]> => {
  try {
   const response = await api.get("/leads");
    return response.data;
  } catch (error) {
    // fallback to mock data
    console.warn("Using mock leads data");
    return mockLeads;
  }
};

export const getLeadById = async (id: string): Promise<Lead> => {
  const response = await api.get(`/leads/${id}`);
  return response.data;
};
