import { Customer } from "./types";

export const mockCustomer: Customer[] = [
    {
        Id: "C001",
        FirstName: "John",
        LastName: "Smith",
        Gender: "Male",
        ContactType: "Client",
        Company: "Acme Corp",
        JobTitle: "Manager",
        Role: "Decision Maker",
        EmailAddress: "John.smith@acme.com",
        PhoneNumber: "555-123-4567",
        Address: "123 Main st",
        City: "Chicago",
        State: "IL",
        ZipCode: "60001",
        NoEmailMarketing: false,
        status: "Active"
    },
    {
        Id: "C002",
        FirstName: "Amy",
        LastName: "Patel",
        Gender: "Female",
        ContactType: "Partner",
        Company: "Bright Solutions",
        JobTitle: "Director",
        Role: "Influencer",
        EmailAddress: "amy.j@bright.com",
        PhoneNumber: "555-123-6543",
        Address: "23 Harvest view st",
        City: "Seattle",
        State: "WA",
        ZipCode: "98010",
        NoEmailMarketing: true,
        status: "Inactive"
    },
    {
        Id: "Cust_003",
        FirstName: "Dylan",
        LastName: "Smith",
        Gender: "Male",
        ContactType: "Lead",
        Company: "NextGen Tech",
        JobTitle: "Engineer",
        Role: "Technical Contact",
        EmailAddress: "c.ramirez@nextgen.com",
        PhoneNumber: "555-999-4567",
        Address: "3001 kirkwood st",
        City: "Iowa",
        State: "IA",
        ZipCode: "52601",
        NoEmailMarketing: false,
        status: "Active"
    }

];