import { useQuery } from "@tanstack/react-query";
import { getMockLeads, getLeadById } from "../api";
import type { Lead } from "../types";





// Fetch all leads
export const useLeads = () => {
  return useQuery<Lead[], Error>({
    queryKey: ["leads"],
    queryFn: getMockLeads,
  });
};

// Fetch a single lead by ID
export const useLead = (id?: string) => {
  return useQuery<Lead, Error>({
    queryKey: ["leads", id],
    queryFn: () => getLeadById(id as string),
    enabled: !!id,
  });
};
