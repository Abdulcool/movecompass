import AsyncStorage from '@react-native-async-storage/async-storage';
import { api,ApiError } from './api';
import { unregisterNotifications } from './notifications';

export async function clearSession(base:string,token:string) {
  try {await unregisterNotifications(base,token);await api(base,'/api/auth/logout',token,{});}
  catch(error){if(!(error instanceof ApiError)||![401,403].includes(error.status))throw error;}
  await AsyncStorage.multiRemove(['mc-token','mc-user','mc-push-token','mc-push-registered']);
}
