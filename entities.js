import { createClient } from 'https://esm.sh/@base44/sdk@latest';

const base44 = createClient({ appId: "69e30defd345968f8174a3ce" });

export const { Airport, FocusFlight, UserStats } = base44.entities;

export default base44;
