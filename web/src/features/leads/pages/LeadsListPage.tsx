import { useLeads } from "../hooks/useLeads";
import { Link } from "react-router-dom";

export  function LeadsListPage () {
  const { data: leads, isLoading, error } = useLeads();

  if (isLoading) return <div>Loading leads...</div>;
  if (error) return <div>Error loading leads</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Leads</h2>
      <ul className="space-y-2">
        {leads?.map((lead) => (
          <li
            key={lead.id}
            className="p-3 bg-white rounded shadow flex justify-between items-center"
          >
            <div>
              <Link to={`/leads/${lead.id}`} className="font-semibold hover:underline">
                {lead.name}
              </Link>
              <p className="text-sm text-gray-500">{lead.email}</p>
            </div>
            <span className="text-sm bg-gray-200 px-2 py-1 rounded">{lead.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}



