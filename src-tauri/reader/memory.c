/* Standalone read-only /proc adapter. No ptrace, injection or process writes.
 * Build: zig cc -target x86_64-linux-musl -static -Os -s memory.c -o memory-x86_64
 * Request: little-endian u64 address, u32 length. Reply: u32 length + bytes,
 * or UINT32_MAX on a failed read. One PID per invocation; stdin EOF exits.
 */
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <poll.h>

static int transfer(int fd, void *buf, size_t len, int output) {
    while (len) {
        if (!output) { struct pollfd p={fd,POLLIN,0}; if(poll(&p,1,30000)<=0)return 0; }
        ssize_t n=output?write(fd,buf,len):read(fd,buf,len);
        if(n<=0)return 0; buf=(char*)buf+n;len-=(size_t)n;
    } return 1;
}
int main(int argc,char **argv) {
    if(argc!=2)return 2;
    char *end;long pid=strtol(argv[1],&end,10);if(*end||pid<=0)return 2;
    char path[64];snprintf(path,sizeof path,"/proc/%ld/mem",pid);
    int fd=open(path,O_RDONLY|O_CLOEXEC);if(fd<0)return 3;
    uint64_t total=0;
    for(;;) {
        uint64_t address;uint32_t length;
        if(!transfer(0,&address,8,0)||!transfer(0,&length,4,0))break;
        if(!length||length>32*1024*1024||address<4096||address>=0x800000000000ULL||total+length>768*1024*1024ULL)break;
        total+=length;void *buffer=malloc(length);if(!buffer)break;
        ssize_t n=pread(fd,buffer,length,(off_t)address);
        uint32_t reply=n>0?(uint32_t)n:UINT32_MAX;
        int ok=transfer(1,&reply,4,1)&&(n<=0||transfer(1,buffer,(size_t)n,1));free(buffer);if(!ok)break;
    }
    close(fd);return 0;
}
