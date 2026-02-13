import { Link } from "react-router-dom";
import { useCustomers } from "../hooks/useCustomers";

export function CustomersListPage() {
  const { data: customers, isLoading, error } = useCustomers();

  if (isLoading) return <div>Loading customers...</div>;
  if (error) return <div>Error loading customers</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Customers</h2>

      <ul className="space-y-2">
      {customers?.map((c) => (
          <li
            key={c.Id}
            className="p-3 bg-white rounded shadow flex justify-between items-center"
          >
            <div>
              <Link
                to={`/customers/${c.Id}`}
                className="font-semibold hover:underline"
              >
                {c.FirstName} {c.LastName}
              </Link>

              <p className="text-sm text-gray-500">{c.EmailAddress}</p>
            </div>

            <span className="text-sm bg-gray-200 px-2 py-1 rounded">
              {c.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  ); 
}