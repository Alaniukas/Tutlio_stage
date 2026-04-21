import { createContext, useContext } from 'react';

export type OrgEntityType = 'company' | 'school';

const OrgEntityContext = createContext<OrgEntityType>('company');

export const OrgEntityProvider = OrgEntityContext.Provider;
export function useOrgEntityType(): OrgEntityType {
  return useContext(OrgEntityContext);
}
