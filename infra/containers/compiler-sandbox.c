#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

#ifndef LANDLOCK_ACCESS_FS_REFER
#define LANDLOCK_ACCESS_FS_REFER (1ULL << 13)
#endif
#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif

static void fail(const char *message) {
    perror(message);
    exit(126);
}

static void allow_path(int ruleset, const char *path, uint64_t access) {
    int parent = open(path, O_PATH | O_CLOEXEC);
    if (parent < 0) {
        if (errno == ENOENT) return;
        fail("Compiler sandbox path");
    }
    struct stat metadata;
    if (fstat(parent, &metadata)) fail("Compiler sandbox metadata");
    if (!S_ISDIR(metadata.st_mode)) {
        access &= LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_READ_FILE |
                  LANDLOCK_ACCESS_FS_WRITE_FILE | LANDLOCK_ACCESS_FS_TRUNCATE;
    }
    struct landlock_path_beneath_attr rule = {.allowed_access = access, .parent_fd = parent};
    if (syscall(SYS_landlock_add_rule, ruleset, LANDLOCK_RULE_PATH_BENEATH, &rule, 0)) {
        fail("Compiler sandbox allowlist");
    }
    close(parent);
}

int main(int argc, char **argv) {
    if (argc < 2) {
        fputs("Compiler sandbox requires an executable.\n", stderr);
        return 126;
    }
    int abi = syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
    if (abi < 1) fail("Compiler sandbox requires Linux Landlock");
    uint64_t read = LANDLOCK_ACCESS_FS_EXECUTE | LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR;
    uint64_t write = LANDLOCK_ACCESS_FS_WRITE_FILE | LANDLOCK_ACCESS_FS_REMOVE_DIR |
        LANDLOCK_ACCESS_FS_REMOVE_FILE | LANDLOCK_ACCESS_FS_MAKE_DIR |
        LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_MAKE_SOCK |
        LANDLOCK_ACCESS_FS_MAKE_FIFO | LANDLOCK_ACCESS_FS_MAKE_SYM;
    if (abi >= 2) write |= LANDLOCK_ACCESS_FS_REFER;
    if (abi >= 3) write |= LANDLOCK_ACCESS_FS_TRUNCATE;
    struct landlock_ruleset_attr ruleset_attr = {.handled_access_fs = read | write |
        LANDLOCK_ACCESS_FS_MAKE_CHAR | LANDLOCK_ACCESS_FS_MAKE_BLOCK};
    int ruleset = syscall(SYS_landlock_create_ruleset, &ruleset_attr, sizeof(ruleset_attr), 0);
    if (ruleset < 0) fail("Compiler sandbox ruleset");
    const char *read_paths[] = {"/app", "/usr", "/lib", "/lib64", "/etc",
        "/proc/cpuinfo", "/proc/meminfo", "/proc/stat", "/proc/sys/kernel/osrelease", NULL};
    for (const char **path = read_paths; *path; path++) allow_path(ruleset, *path, read);
    const char *workspace = getenv("TMPDIR");
    if (!workspace || workspace[0] != '/') {
        fputs("Compiler sandbox requires an absolute task workspace.\n", stderr);
        return 126;
    }
    allow_path(ruleset, workspace, read | write);
    allow_path(ruleset, "/dev/null", LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE);
    allow_path(ruleset, "/dev/urandom", LANDLOCK_ACCESS_FS_READ_FILE);
    allow_path(ruleset, "/dev/random", LANDLOCK_ACCESS_FS_READ_FILE);
    if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) fail("Compiler sandbox no-new-privileges");
    if (syscall(SYS_landlock_restrict_self, ruleset, 0)) fail("Compiler sandbox restriction");
    close(ruleset);
    execv(argv[1], &argv[1]);
    fail("Compiler sandbox exec");
}
