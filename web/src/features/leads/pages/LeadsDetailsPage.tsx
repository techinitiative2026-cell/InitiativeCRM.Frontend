import { useParams } from "react-router-dom";
import { useLead } from "../hooks/useLeads";

export function LeadDetailsPage() {
  // useParams returns { [key: string]: string | undefined }
  const params = useParams();
  const id = params.id; // id can be string | undefined

  // Only call useLead if id exists
  const { data: lead, isLoading, error } = useLead(id ?? "");

  if (!id) return <div>Invalid lead ID</div>;
  if (isLoading) return <div>Loading lead details...</div>;
  if (error) return <div>Error loading lead details</div>;
  if (!lead) return <div>Lead not found</div>;

  return (
    <div>
      <h1>{lead.name}</h1>
      <p>Email: {lead.email}</p>
      <p>Status: {lead.status}</p>
      {/* Add more details or actions here */}
    </div>
  );
}
