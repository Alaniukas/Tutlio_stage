export const useUser=()=>({user:{id:'qa-user',app_metadata:{temporary_password:sessionStorage.getItem('qa-password-changed')!=='yes'}},loading:false});
export const useOrgAdminAccess=()=>({can:()=>true});
export const useOrgFeatures=()=>({hasFeature:()=>true,loading:false});
export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'fixture-token'}}}),refreshSession:async()=>{sessionStorage.setItem('qa-password-changed','yes');return {error:null};}}};
