import { api } from "@/services/httpClient";
import type {Customer} from "./types";
import { mockCustomer } from "./mockCustomers"; 

export const getCustomers = async (): Promise<Customer[]> => {
    const response = await api.get("/customers");
    return response.data;
};

export const getMockCustomers = async (): Promise<Customer[]> => {
    try{
        const response  = await api.get("/customers");
        return response.data;
    } catch(error){
        console.warn("Using Mock Customers Data");
        return mockCustomer;
    }
    
};
export const getCustomerById = async (id: string): Promise<Customer> => {
    const response = await api.get(`/customers/${id}`);
    return response.data;
};