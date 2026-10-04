// Local container QA only: one mapped UID, no SETUID capability. Does not alter SQL roles.
#define _GNU_SOURCE
#include <sys/types.h>
#include <sys/stat.h>
#include <dlfcn.h>
#include <unistd.h>
uid_t getuid(void){return 1000;}
uid_t geteuid(void){return 1000;}
static void owner(struct stat *s){if(s->st_uid==0)s->st_uid=1000;}
int stat(const char *p,struct stat *s){static int(*real)(const char*,struct stat*);if(!real)real=dlsym(RTLD_NEXT,"stat");int r=real(p,s);if(!r)owner(s);return r;}
int lstat(const char *p,struct stat *s){static int(*real)(const char*,struct stat*);if(!real)real=dlsym(RTLD_NEXT,"lstat");int r=real(p,s);if(!r)owner(s);return r;}
int fstat(int f,struct stat *s){static int(*real)(int,struct stat*);if(!real)real=dlsym(RTLD_NEXT,"fstat");int r=real(f,s);if(!r)owner(s);return r;}
int __xstat(int v,const char*p,struct stat*s){static int(*real)(int,const char*,struct stat*);if(!real)real=dlsym(RTLD_NEXT,"__xstat");int r=real(v,p,s);if(!r)owner(s);return r;}
int __lxstat(int v,const char*p,struct stat*s){static int(*real)(int,const char*,struct stat*);if(!real)real=dlsym(RTLD_NEXT,"__lxstat");int r=real(v,p,s);if(!r)owner(s);return r;}
int __fxstat(int v,int f,struct stat*s){static int(*real)(int,int,struct stat*);if(!real)real=dlsym(RTLD_NEXT,"__fxstat");int r=real(v,f,s);if(!r)owner(s);return r;}
