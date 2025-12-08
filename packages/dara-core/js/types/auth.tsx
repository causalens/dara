export interface User {
    password?: string;
    username?: string;
}

export interface UserData {
    groups?: string[];
    identity_email?: string;
    identity_id?: string;
    identity_name: string;
}
