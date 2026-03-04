import { ApiService } from "./ApiService";
import type {
    Automation,
    CreateAutomationDTO,
    UpdateAutomationDTO,
} from "@/types/automation.types";

export class AutomationService {
    private static instance: AutomationService;
    private api = ApiService.getInstance();

    private constructor() { }

    static getInstance(): AutomationService {
        if (!AutomationService.instance) {
            AutomationService.instance = new AutomationService();
        }
        return AutomationService.instance;
    }

    async getAllAutomations(): Promise<Automation[]> {
        return this.api.get<Automation[]>("/api/homes/automations/");
    }

    async getAutomation(id: string): Promise<Automation> {
        return this.api.get<Automation>(`/api/homes/automations/${id}/`);
    }

    async createAutomation(data: CreateAutomationDTO): Promise<Automation> {
        return this.api.post<Automation>("/api/homes/automations/", data);
    }

    async updateAutomation(
        id: string,
        data: UpdateAutomationDTO,
    ): Promise<Automation> {
        return this.api.patch<Automation>(`/api/homes/automations/${id}/`, data);
    }

    async deleteAutomation(id: string): Promise<void> {
        await this.api.delete(`/api/homes/automations/${id}/`);
    }
}
